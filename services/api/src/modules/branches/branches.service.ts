import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Branch, OtpChallenge, Prisma } from '@prisma/client';
import { OtpChannel, OtpPurpose, UserStatus } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { JwtTokenService } from '../../common/auth/jwt-token.service';
import { buildStaffInvitationAcceptUrl } from '../../common/config/web-app-url';
import {
  getPrismaUniqueConstraintTargets,
  isPrismaUniqueConstraintError,
} from '../../common/database/prisma-errors';
import { generateAgentPublicId } from '../../common/security/agent-public-id';
import {
  isInternationalPhoneNumber,
  normalizeEmailAddress,
  normalizeInternationalPhoneNumber,
} from '../../common/security/identity-normalization';
import { OtpService } from '../../common/security/otp.service';
import { PasswordService } from '../../common/security/password.service';
import { toPublicOtpDelivery } from '../notifications/notifications.contracts';
import { NotificationsService } from '../notifications/notifications.service';
import {
  BranchApiContract,
  BranchListResponseContract,
  BranchStaffInvitationLookupResponseContract,
  BranchResponseContract,
  BranchStaffInvitationAcceptanceResponseContract,
  BranchStaffInvitationResponseContract,
  BranchStaffInviteStatus,
  BranchStaffListResponseContract,
  BranchStaffMemberContract,
  BranchStaffUserContract,
} from './branches.contracts';
import {
  BranchesRepository,
  UserIdentityConflictError,
} from './branches.repository';
import { BRANCH_PERMISSIONS } from './branches.permissions';
import { AcceptBranchStaffInvitationDto } from './dto/accept-branch-staff-invitation.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { InviteBranchStaffDto } from './dto/invite-branch-staff.dto';
import { LookupBranchStaffInvitationDto } from './dto/lookup-branch-staff-invitation.dto';

const STAFF_INVITATION_TTL_DAYS = 7;

const STAFF_ROLE_PERMISSIONS: Record<string, string[]> = {
  'Branch Manager': [
    'branch.read',
    'branch.staff.read',
    'branch.staff.invite',
    'user.read',
    'user.invite',
    'customer.create',
    'customer.read',
    'customer.update',
    'loan.create',
    'loan.read',
    'loan.update',
    'loan.product.manage',
    'collection.create',
    'collection.read',
    'report.read',
  ],
  Supervisor: [
    'branch.read',
    'branch.staff.read',
    'customer.create',
    'customer.read',
    'customer.update',
    'loan.create',
    'loan.read',
    'collection.create',
    'collection.read',
  ],
  'Loan Officer': [
    'branch.read',
    'customer.create',
    'customer.read',
    'customer.update',
    'loan.create',
    'loan.read',
    'collection.create',
    'collection.read',
  ],
  Agent: [
    'branch.read',
    'customer.create',
    'customer.read',
    'loan.create',
    'loan.read',
    'collection.create',
    'collection.read',
  ],
  Cashier: [
    'branch.read',
    'customer.read',
    'cashdrawer.open',
    'cashdrawer.close',
    'cashdrawer.reconcile',
    'cashier.read',
  ],
  'Recovery Officer': [
    'branch.read',
    'customer.read',
    'loan.read',
    'collection.create',
    'collection.read',
    'arrears.read',
    'recovery.assign',
  ],
};

type StaffUserRecord = {
  id: string;
  branchId: string | null;
  displayName: string;
  email: string;
  phone: string | null;
  publicId: string | null;
  status: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  roles: Array<{
    role: {
      name: string;
    };
  }>;
};

type StaffMemberRecord = StaffUserRecord & {
  createdAt: Date;
  otpChallenges?: Array<
    Pick<OtpChallenge, 'createdAt' | 'expiresAt' | 'consumedAt'>
  >;
};

@Injectable()
export class BranchesService {
  constructor(
    private readonly branchesRepository: BranchesRepository,
    private readonly configService: ConfigService,
    private readonly jwtTokenService: JwtTokenService,
    private readonly notificationsService: NotificationsService,
    private readonly otpService: OtpService,
    private readonly passwordService: PasswordService,
  ) {}

  async createBranch(
    user: AuthenticatedUser,
    dto: CreateBranchDto,
  ): Promise<BranchResponseContract> {
    const name = dto.branchName.trim();

    const duplicate = await this.branchesRepository.findByTenantAndName({
      tenantId: user.tenantId,
      name,
    });

    if (duplicate) {
      throw new ConflictException('A branch with this name already exists.');
    }

    const branchPhone = dto.branchPhone
      ? normalizeInternationalPhoneNumber(dto.branchPhone)
      : null;

    if (branchPhone && !isInternationalPhoneNumber(branchPhone)) {
      throw new BadRequestException(
        'branchPhone must be a valid international phone number.',
      );
    }

    const branch = await this.branchesRepository.createWithAuditAndOutbox({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      name,
      address: dto.branchAddress.trim(),
      gpsLatitude: dto.gpsLatitude,
      gpsLongitude: dto.gpsLongitude,
      phone: branchPhone,
      workingHours: dto.workingHours
        ? this.toJsonInputValue(dto.workingHours)
        : undefined,
    });

    return {
      branch: this.toBranchContract(branch, []),
    };
  }

  async listBranches(
    user: AuthenticatedUser,
  ): Promise<BranchListResponseContract> {
    const branches = await this.branchesRepository.listByTenantWithStaff(
      user.tenantId,
    );

    const canManageAllBranches = user.permissions.includes(
      BRANCH_PERMISSIONS.create,
    );

    let visibleBranches = branches;

    if (!canManageAllBranches) {
      const membership = await this.branchesRepository.findUserBranchId({
        tenantId: user.tenantId,
        userId: user.userId,
      });

      visibleBranches = membership?.branchId
        ? branches.filter((branch) => branch.id === membership.branchId)
        : [];
    }

    return {
      branches: visibleBranches.map((branch) =>
        this.toBranchContract(branch, branch.users),
      ),
    };
  }

  async listBranchStaff(
    user: AuthenticatedUser,
    branchId: string,
  ): Promise<BranchStaffListResponseContract> {
    const branch = await this.branchesRepository.findByTenantAndId({
      tenantId: user.tenantId,
      branchId,
    });

    if (!branch) {
      throw new NotFoundException('Branch was not found.');
    }

    const canManageAllBranches = user.permissions.includes(
      BRANCH_PERMISSIONS.create,
    );

    if (!canManageAllBranches && user.branchId !== branchId) {
      throw new NotFoundException('Branch was not found.');
    }

    const staff = await this.branchesRepository.listBranchStaff({
      tenantId: user.tenantId,
      branchId,
    });

    return {
      staff: staff.map((member) => this.toStaffMemberContract(member)),
    };
  }

  async inviteBranchStaff(
    user: AuthenticatedUser,
    branchId: string,
    dto: InviteBranchStaffDto,
  ): Promise<BranchStaffInvitationResponseContract> {
    const branch = await this.branchesRepository.findByTenantAndId({
      tenantId: user.tenantId,
      branchId,
    });

    if (!branch) {
      throw new NotFoundException('Branch was not found.');
    }

    const canManageAllBranches = user.permissions.includes(
      BRANCH_PERMISSIONS.create,
    );

    if (!canManageAllBranches && user.branchId !== branchId) {
      throw new NotFoundException('Branch was not found.');
    }

    const roleName = this.normalizeStaffRole(dto.roleName);
    const normalizedEmail = normalizeEmailAddress(dto.email);

    const existingEmail =
      await this.branchesRepository.findUserByEmail(normalizedEmail);

    if (existingEmail) {
      throw new ConflictException('A user with this email already exists.');
    }

    const token = this.generateInvitationToken();
    const issuedAt = new Date();
    const invitationExpiresAt = new Date(
      Date.now() + STAFF_INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    const result = await this.branchesRepository
      .createStaffInvitationWithAuditAndOutbox({
        tenantId: user.tenantId,
        actorUserId: user.userId,
        branchId,
        email: normalizedEmail,
        displayName: dto.displayName.trim(),
        publicId: generateAgentPublicId(),
        roleName,
        rolePermissionKeys: STAFF_ROLE_PERMISSIONS[roleName],
        invitationTokenHash: this.otpService.hashCode(token),
        invitationExpiresAt,
        issuedAt,
      })
      .catch((error: unknown) => {
        if (error instanceof UserIdentityConflictError) {
          this.throwStaffIdentityConflict(error.field);
        }

        this.throwStaffIdentityConflictFromDatabaseError(error);
        throw error;
      });

    const delivery = await this.notificationsService.sendStaffInvitationEmail({
      tenantId: user.tenantId,
      userId: result.user.id,
      destination: normalizedEmail,
      invitedByName: user.displayName,
      workspaceName: branch.tenant.name,
      branchName: branch.name,
      roleName,
      token,
      expiresAt: invitationExpiresAt,
    });

    const acceptUrl = this.buildInvitationAcceptUrl(token);
    const showDevAcceptUrl =
      !delivery.delivered &&
      this.configService.get<string>('NODE_ENV') !== 'production';

    return {
      staffUser: this.toStaffUserContract(result.user),
      emailDelivery: toPublicOtpDelivery(delivery),
      invitation: {
        status: 'INVITE_PENDING',
        expiresAt: invitationExpiresAt,
        ...(showDevAcceptUrl ? { acceptUrl } : {}),
      },
    };
  }

  async lookupStaffInvitation(
    dto: LookupBranchStaffInvitationDto,
  ): Promise<BranchStaffInvitationLookupResponseContract> {
    const invitation = await this.getOpenStaffInvitation(dto.token);

    return {
      invitation: {
        email: invitation.user.email,
        name: invitation.user.displayName,
        roleName: invitation.user.roles[0]?.role.name ?? 'Staff',
        branchName: invitation.user.branch?.name ?? 'Branch',
        branchAddress: invitation.user.branch?.address ?? null,
        workspaceName: invitation.tenant.name,
        workspaceCountry: invitation.tenant.country,
        workspaceCurrency: invitation.tenant.currency,
        invitedByName: null,
        expiresAt: invitation.expiresAt,
        status: 'OPEN',
      },
    };
  }

  async acceptStaffInvitation(
    dto: AcceptBranchStaffInvitationDto,
  ): Promise<BranchStaffInvitationAcceptanceResponseContract> {
    const invitation = await this.getOpenStaffInvitation(dto.token);
    if (invitation.user.status !== UserStatus.INVITED) {
      throw new BadRequestException('Invitation has already been accepted.');
    }

    const normalizedPhone = normalizeInternationalPhoneNumber(dto.phone);

    if (!isInternationalPhoneNumber(normalizedPhone)) {
      throw new BadRequestException(
        'phone must be a valid international phone number.',
      );
    }

    if (dto.password.trim().length < 8) {
      throw new BadRequestException('Password must be at least 8 characters.');
    }

    const result = await this.branchesRepository
      .acceptStaffInvitationWithProfile({
        challengeId: invitation.id,
        userId: invitation.user.id,
        passwordHash: await this.passwordService.hashPassword(dto.password),
        phone: normalizedPhone,
      })
      .catch((error: unknown) => {
        if (error instanceof UserIdentityConflictError) {
          this.throwStaffIdentityConflict(error.field);
        }

        this.throwStaffIdentityConflictFromDatabaseError(error);
        throw error;
      });

    const roleName = result.roles[0]?.role.name ?? 'Staff';
    const isManager = roleName === 'Branch Manager';

    return {
      staffUser: this.toStaffUserContract(result),
      workspace: {
        id: result.tenant.id,
        name: result.tenant.name,
        status: result.tenant.status,
        currency: result.tenant.currency,
        country: result.tenant.country,
      },
      branch: result.branch
        ? {
            id: result.branch.id,
            name: result.branch.name,
            address: result.branch.address,
          }
        : null,
      session: await this.buildSession(result.id, result.tenantId),
      onboarding: {
        required: isManager,
        nextStep: isManager ? 'invite_agents' : 'operations',
      },
    };
  }

  private toBranchContract(
    branch: Branch,
    users: StaffMemberRecord[] = [],
  ): BranchApiContract {
    const staff = users.map((member) => this.toStaffMemberContract(member));
    const manager =
      staff.find((member) => member.roleName === 'Branch Manager') ?? null;

    return {
      id: branch.id,
      name: branch.name,
      address: branch.address,
      gpsLatitude: branch.gpsLatitude?.toString() ?? null,
      gpsLongitude: branch.gpsLongitude?.toString() ?? null,
      phone: branch.phone,
      workingHours: branch.workingHours,
      createdAt: branch.createdAt,
      manager,
      staff,
      staffSummary: {
        total: staff.length,
        active: staff.filter((member) => member.inviteStatus === 'ACTIVE')
          .length,
        pendingInvites: staff.filter(
          (member) => member.inviteStatus === 'INVITE_PENDING',
        ).length,
        expiredInvites: staff.filter(
          (member) => member.inviteStatus === 'INVITE_EXPIRED',
        ).length,
      },
    };
  }

  private toStaffMemberContract(
    user: StaffMemberRecord,
  ): BranchStaffMemberContract {
    const challenge = user.otpChallenges?.[0] ?? null;
    const inviteStatus = this.resolveInviteStatus(user.status, challenge);

    return {
      id: user.id,
      branchId: user.branchId ?? '',
      roleName: user.roles[0]?.role.name ?? 'Staff',
      name: user.displayName,
      email: user.email,
      phone: user.phone,
      publicId: user.publicId ?? null,
      status: user.status,
      inviteStatus,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      invitedAt: challenge?.createdAt ?? user.createdAt,
      inviteExpiresAt: challenge?.expiresAt ?? null,
    };
  }

  private resolveInviteStatus(
    status: string,
    challenge: Pick<OtpChallenge, 'expiresAt' | 'consumedAt'> | null,
  ): BranchStaffInviteStatus {
    if (status === UserStatus.ACTIVE) {
      return 'ACTIVE';
    }

    if (status === UserStatus.SUSPENDED) {
      return 'SUSPENDED';
    }

    if (status === UserStatus.PENDING_VERIFICATION) {
      return 'PENDING_VERIFICATION';
    }

    if (status === UserStatus.INVITED) {
      if (challenge && challenge.expiresAt.getTime() < Date.now()) {
        return 'INVITE_EXPIRED';
      }

      return 'INVITE_PENDING';
    }

    return 'INVITE_PENDING';
  }

  private buildInvitationAcceptUrl(token: string) {
    return buildStaffInvitationAcceptUrl(this.configService, token);
  }

  private toStaffUserContract(user: StaffUserRecord): BranchStaffUserContract {
    return {
      id: user.id,
      branchId: user.branchId ?? '',
      roleName: user.roles[0]?.role.name ?? 'Staff',
      name: user.displayName,
      email: user.email,
      phone: user.phone,
      publicId: user.publicId ?? null,
      status: user.status,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
    };
  }

  private normalizeStaffRole(roleName: string): string {
    const normalized = Object.keys(STAFF_ROLE_PERMISSIONS).find(
      (allowedRole) =>
        allowedRole.toLowerCase() === roleName.trim().toLowerCase(),
    );

    if (!normalized) {
      throw new BadRequestException('Unsupported branch staff role.');
    }

    return normalized;
  }

  private async getOpenStaffInvitation(tokenInput: string) {
    const token = tokenInput.trim();
    const invitation =
      await this.branchesRepository.findOpenStaffInvitationByHash(
        this.otpService.hashCode(token),
      );

    if (
      !invitation ||
      invitation.channel !== OtpChannel.EMAIL ||
      invitation.purpose !== OtpPurpose.EMPLOYEE_INVITATION
    ) {
      throw new NotFoundException('Invitation token was not found.');
    }

    if (!this.otpService.verifyCode(token, invitation.codeHash)) {
      throw new NotFoundException('Invitation token was not found.');
    }

    if (invitation.expiresAt.getTime() < Date.now()) {
      throw new GoneException('Invitation token has expired.');
    }

    if (!invitation.user) {
      throw new BadRequestException('Invitation is not linked to a user.');
    }

    return {
      ...invitation,
      user: invitation.user,
    };
  }

  private generateInvitationToken(): string {
    const testToken = this.configService.get<string>(
      'AUTH_INVITATION_TEST_TOKEN',
    );

    if (
      this.configService.get<string>('NODE_ENV') === 'test' &&
      testToken &&
      testToken.length >= 24
    ) {
      return testToken;
    }

    return randomBytes(32).toString('base64url');
  }

  private throwStaffIdentityConflictFromDatabaseError(error: unknown) {
    if (!isPrismaUniqueConstraintError(error)) {
      return;
    }

    const targets = getPrismaUniqueConstraintTargets(error);

    if (targets.includes('email')) {
      throw new ConflictException('A user with this email already exists.');
    }

    if (targets.includes('phone')) {
      throw new ConflictException(
        'A user with this phone number already exists.',
      );
    }

    throw new ConflictException('A conflicting user already exists.');
  }

  private throwStaffIdentityConflict(field: 'email' | 'phone'): never {
    if (field === 'email') {
      throw new ConflictException('A user with this email already exists.');
    }

    throw new ConflictException(
      'A user with this phone number already exists.',
    );
  }

  private async buildSession(userId: string, tenantId: string) {
    const token = this.jwtTokenService.issueAccessToken({ userId, tenantId });
    const permissions =
      await this.branchesRepository.listUserPermissionKeys(userId);

    return {
      ...token,
      tokenType: 'Bearer' as const,
      permissions: [
        ...new Set(
          permissions.flatMap((userRole) =>
            userRole.role.permissions.map(
              (rolePermission) => rolePermission.permission.key,
            ),
          ),
        ),
      ],
    };
  }

  private toJsonInputValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
