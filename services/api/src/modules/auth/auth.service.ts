import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ModuleStatus,
  OtpChannel,
  OtpChallenge,
  OtpPurpose,
  Tenant,
  TenantStatus,
  User,
  UserStatus,
} from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { JwtTokenService } from '../../common/auth/jwt-token.service';
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
import { PrismaService } from '../../database/prisma.service';
import { OtpService } from '../../common/security/otp.service';
import { PasswordService } from '../../common/security/password.service';
import {
  EmailOtpDeliveryResult,
  toPublicOtpDelivery,
} from '../notifications/notifications.contracts';
import { NOTIFICATION_EVENTS } from '../notifications/notifications.events';
import { NotificationsService } from '../notifications/notifications.service';
import { REMBEH_MODULES } from '../platform/module-registry';
import { ObjectStorageService } from '../storage/object-storage.service';
import { AUTH_EVENTS } from './auth.events';
import {
  WorkspaceEmailOtpResendResponse,
  WorkspaceOtpVerificationResponse,
  WorkspaceRegistrationResponse,
} from './auth.contracts';
import { LoginDto } from './dto/login.dto';
import { RefreshSessionDto } from './dto/refresh-session.dto';
import { RegisterWorkspaceDto } from './dto/register-workspace.dto';
import { ResendWorkspaceEmailOtpDto } from './dto/resend-workspace-email-otp.dto';
import { VerifyWorkspaceEmailDto } from './dto/verify-workspace-email.dto';

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const OTP_MAX_RESENDS = 3;
const DEFAULT_ENABLED_MODULES = [
  'workspace',
  'identity',
  'customers',
  'loans',
  'collections',
  'cashiers',
  'reports',
  'notifications',
];

type WorkspaceRegistrationEntities = {
  tenant: Tenant;
  owner: User;
  emailChallenge: OtpChallenge;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otpService: OtpService,
    private readonly passwordService: PasswordService,
    private readonly jwtTokenService: JwtTokenService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly objectStorage: ObjectStorageService,
  ) {}

  async registerWorkspace(
    dto: RegisterWorkspaceDto,
  ): Promise<WorkspaceRegistrationResponse> {
    const normalizedEmail = normalizeEmailAddress(dto.email);
    const normalizedCurrency = dto.currency.trim().toUpperCase();
    const normalizedPhone = normalizeInternationalPhoneNumber(dto.phone);

    if (!isInternationalPhoneNumber(normalizedPhone)) {
      throw new BadRequestException(
        'phone must be a valid international phone number.',
      );
    }

    await this.assertWorkspaceOwnerIdentityAvailable({
      email: normalizedEmail,
      phone: normalizedPhone,
    });

    const passwordHash = await this.passwordService.hashPassword(dto.password);
    const emailOtpCode = this.generateEmailOtpCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
    const issuedAt = new Date();

    const result = await this.prisma
      .$transaction(async (tx) => {
        await this.lockUserIdentity(tx, {
          email: normalizedEmail,
          phone: normalizedPhone,
        });
        await this.assertWorkspaceOwnerIdentityAvailable(
          {
            email: normalizedEmail,
            phone: normalizedPhone,
          },
          tx,
        );

        const tenant = await tx.tenant.create({
          data: {
            name: dto.businessName.trim(),
            registrationNumber: null,
            country: dto.country.trim(),
            currency: normalizedCurrency,
            status: TenantStatus.PENDING_VERIFICATION,
            storagePrefix: null,
          },
        });

        const storagePrefix = `tenants/${tenant.id}/`;
        await tx.tenant.update({
          where: { id: tenant.id },
          data: { storagePrefix },
        });
        tenant.storagePrefix = storagePrefix;

        const owner = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email: normalizedEmail,
            phone: normalizedPhone,
            publicId: generateAgentPublicId(),
            displayName: dto.ownerName.trim(),
            passwordHash,
            status: UserStatus.PENDING_VERIFICATION,
          },
        });

        const permissionRows = REMBEH_MODULES.flatMap((moduleDefinition) =>
          moduleDefinition.permissions.map((permission) => ({
            tenantId: tenant.id,
            key: permission,
            moduleKey: moduleDefinition.key,
            description: `${moduleDefinition.name}: ${permission}`,
          })),
        );

        await tx.permission.createMany({
          data: permissionRows,
          skipDuplicates: true,
        });

        const ownerRole = await tx.role.create({
          data: {
            tenantId: tenant.id,
            name: 'Account Owner',
            description: 'Full access to the account and enabled modules.',
            isSystem: true,
          },
        });

        const permissions = await tx.permission.findMany({
          where: { tenantId: tenant.id },
          select: { id: true },
        });

        await tx.rolePermission.createMany({
          data: permissions.map((permission) => ({
            roleId: ownerRole.id,
            permissionId: permission.id,
          })),
        });

        await tx.userRole.create({
          data: {
            userId: owner.id,
            roleId: ownerRole.id,
          },
        });

        await tx.tenantModule.createMany({
          data: DEFAULT_ENABLED_MODULES.map((moduleKey) => ({
            tenantId: tenant.id,
            moduleKey,
            status: ModuleStatus.ENABLED,
          })),
        });

        const emailChallenge = await tx.otpChallenge.create({
          data: {
            tenantId: tenant.id,
            userId: owner.id,
            channel: OtpChannel.EMAIL,
            purpose: OtpPurpose.WORKSPACE_REGISTRATION,
            destination: normalizedEmail,
            codeHash: this.otpService.hashCode(emailOtpCode),
            expiresAt,
            sentAt: issuedAt,
            lastSentAt: issuedAt,
          },
        });

        await tx.outboxEvent.create({
          data: {
            tenantId: tenant.id,
            topic: AUTH_EVENTS.workspaceRegistrationStarted,
            aggregateType: 'tenant',
            aggregateId: tenant.id,
            payload: {
              tenantId: tenant.id,
              ownerUserId: owner.id,
              email: normalizedEmail,
            },
          },
        });

        return {
          tenant,
          owner,
          emailChallenge,
        };
      })
      .catch((error: unknown) => {
        this.throwRegistrationConflictFromDatabaseError(error);
        throw error;
      });

    try {
      await this.objectStorage.provisionTenantPrefix({
        tenantId: result.tenant.id,
        name: result.tenant.name,
        country: result.tenant.country,
        currency: result.tenant.currency,
      });
    } catch {
      // Registration must succeed even if object storage is temporarily unavailable.
      // Keys remain under tenants/{tenantId}/ once uploads begin.
    }

    const emailDelivery = await this.notificationsService.sendEmailOtp({
      tenantId: result.tenant.id,
      userId: result.owner.id,
      destination: normalizedEmail,
      code: emailOtpCode,
      purpose: 'WORKSPACE_REGISTRATION',
      expiresAt,
    });
    await this.prisma.outboxEvent.create({
      data: {
        tenantId: result.tenant.id,
        topic: AUTH_EVENTS.workspaceEmailOtpIssued,
        aggregateType: 'otp_challenge',
        aggregateId: result.emailChallenge.id,
        payload: {
          challengeId: result.emailChallenge.id,
          destination: normalizedEmail,
          provider: emailDelivery.provider,
          delivered: emailDelivery.delivered,
        },
      },
    });
    await this.recordOtpDeliveryResult(
      result.tenant.id,
      result.emailChallenge.id,
      emailDelivery,
    );

    return this.buildWorkspaceRegistrationResponse(
      {
        tenant: result.tenant,
        owner: result.owner,
        emailChallenge: result.emailChallenge,
      },
      emailDelivery,
    );
  }

  async resendWorkspaceEmailOtp(
    dto: ResendWorkspaceEmailOtpDto,
  ): Promise<WorkspaceEmailOtpResendResponse> {
    const challenge = await this.prisma.otpChallenge.findUnique({
      where: { id: dto.challengeId },
      include: {
        tenant: true,
        user: true,
      },
    });

    if (
      !challenge ||
      challenge.purpose !== OtpPurpose.WORKSPACE_REGISTRATION ||
      challenge.channel !== OtpChannel.EMAIL
    ) {
      throw new NotFoundException('OTP challenge was not found.');
    }

    if (challenge.consumedAt) {
      throw new BadRequestException('OTP challenge has already been used.');
    }

    if (challenge.tenant.status !== TenantStatus.PENDING_VERIFICATION) {
      throw new BadRequestException('Account is not pending verification.');
    }

    const maxResends = this.getMaxOtpResends();
    if (challenge.resendCount >= maxResends) {
      throw new BadRequestException('OTP resend limit reached.');
    }

    const lastIssuedAt =
      challenge.lastSentAt ?? challenge.sentAt ?? challenge.createdAt;
    const resendAvailableAt = this.getResendAvailableAt(lastIssuedAt);

    if (resendAvailableAt.getTime() > Date.now()) {
      const waitSeconds = Math.ceil(
        (resendAvailableAt.getTime() - Date.now()) / 1000,
      );
      throw new BadRequestException(
        `Please wait ${waitSeconds} seconds before requesting another OTP.`,
      );
    }

    const otpCode = this.generateEmailOtpCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
    const issuedAt = new Date();

    const updatedChallenge = await this.prisma.$transaction(async (tx) => {
      const refreshedChallenge = await tx.otpChallenge.update({
        where: { id: challenge.id },
        data: {
          codeHash: this.otpService.hashCode(otpCode),
          expiresAt,
          attempts: 0,
          sentAt: challenge.sentAt ?? issuedAt,
          lastSentAt: issuedAt,
          resendCount: { increment: 1 },
        },
      });

      await tx.outboxEvent.create({
        data: {
          tenantId: challenge.tenantId,
          topic: AUTH_EVENTS.workspaceEmailOtpResent,
          aggregateType: 'otp_challenge',
          aggregateId: challenge.id,
          payload: {
            challengeId: challenge.id,
            destination: challenge.destination,
            resendCount: refreshedChallenge.resendCount,
          },
        },
      });

      return refreshedChallenge;
    });

    const delivery = await this.notificationsService.sendEmailOtp({
      tenantId: challenge.tenantId,
      userId: challenge.userId,
      destination: challenge.destination,
      code: otpCode,
      purpose: 'WORKSPACE_REGISTRATION',
      expiresAt,
    });

    await this.recordOtpDeliveryResult(
      challenge.tenantId,
      challenge.id,
      delivery,
    );

    return {
      emailChallenge: this.toOtpChallengeContract(updatedChallenge),
      emailDelivery: toPublicOtpDelivery(delivery),
    };
  }

  async verifyWorkspaceEmail(
    dto: VerifyWorkspaceEmailDto,
  ): Promise<WorkspaceOtpVerificationResponse> {
    const challenge = await this.prisma.otpChallenge.findUnique({
      where: { id: dto.challengeId },
      include: {
        tenant: true,
        user: true,
      },
    });

    if (
      !challenge ||
      challenge.purpose !== OtpPurpose.WORKSPACE_REGISTRATION ||
      challenge.channel !== OtpChannel.EMAIL
    ) {
      throw new NotFoundException('OTP challenge was not found.');
    }

    if (challenge.consumedAt) {
      throw new BadRequestException('OTP challenge has already been used.');
    }

    if (challenge.expiresAt.getTime() < Date.now()) {
      throw new GoneException('OTP challenge has expired.');
    }

    if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
      throw new BadRequestException('OTP challenge is locked.');
    }

    if (!this.otpService.verifyCode(dto.code, challenge.codeHash)) {
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });

      throw new BadRequestException('Invalid OTP code.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedChallenge = await tx.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });

      const owner = challenge.userId
        ? await tx.user.update({
            where: { id: challenge.userId },
            data: {
              emailVerified: true,
            },
          })
        : null;

      if (!owner) {
        throw new BadRequestException('OTP challenge is not linked to a user.');
      }

      const tenant = await tx.tenant.update({
        where: { id: challenge.tenantId },
        data: { status: TenantStatus.ACTIVE },
      });
      const activatedOwner = await tx.user.update({
        where: { id: owner.id },
        data: { status: UserStatus.ACTIVE },
      });

      await tx.outboxEvent.create({
        data: {
          tenantId: challenge.tenantId,
          topic: AUTH_EVENTS.workspaceEmailVerified,
          aggregateType: 'user',
          aggregateId: owner.id,
          payload: {
            tenantId: challenge.tenantId,
            ownerUserId: owner.id,
            challengeId: updatedChallenge.id,
          },
        },
      });

      await tx.outboxEvent.create({
        data: {
          tenantId: tenant.id,
          topic: AUTH_EVENTS.workspaceActivated,
          aggregateType: 'tenant',
          aggregateId: tenant.id,
          payload: {
            tenantId: tenant.id,
            ownerUserId: owner.id,
            challengeId: updatedChallenge.id,
          },
        },
      });

      return { tenant, owner: activatedOwner };
    });

    return this.buildWorkspaceVerificationResponse(result.tenant, result.owner);
  }

  async login(dto: LoginDto) {
    const normalizedEmail = normalizeEmailAddress(dto.email);
    const user = await this.prisma.user.findUnique({
      where: {
        email: normalizedEmail,
      },
      include: {
        tenant: true,
        branch: true,
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const passwordMatches = await this.passwordService.verifyPassword(
      dto.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (
      user.status !== UserStatus.ACTIVE ||
      user.tenant.status !== TenantStatus.ACTIVE
    ) {
      throw new UnauthorizedException('Account or user is not active.');
    }

    const publicId =
      user.publicId ?? (await this.ensureUserPublicId(user.id));
    const roleName = user.roles[0]?.role.name ?? null;
    const profilePhotoStorageKey = user.profilePhotoStorageKey ?? null;
    const profilePhotoUrl = profilePhotoStorageKey
      ? await this.presignProfilePhoto(profilePhotoStorageKey)
      : null;

    return {
      workspace: {
        id: user.tenant.id,
        name: user.tenant.name,
        status: user.tenant.status,
        currency: user.tenant.currency,
        country: user.tenant.country,
      },
      user: {
        id: user.id,
        name: user.displayName,
        email: user.email,
        status: user.status,
        roleName,
        branchId: user.branchId,
        publicId,
        hasProfilePhoto: Boolean(profilePhotoStorageKey),
        profilePhotoStorageKey,
        profilePhotoUrl,
      },
      branch: user.branch
        ? {
            id: user.branch.id,
            name: user.branch.name,
            address: user.branch.address,
          }
        : null,
      session: await this.buildSession(user.id, user.tenantId),
    };
  }

  async getMe(userId: string, tenantId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      include: {
        tenant: true,
        branch: true,
        roles: { include: { role: true } },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    const profilePhotoStorageKey = user.profilePhotoStorageKey ?? null;
    return {
      user: {
        id: user.id,
        name: user.displayName,
        email: user.email,
        status: user.status,
        roleName: user.roles[0]?.role.name ?? null,
        branchId: user.branchId,
        publicId: user.publicId,
        hasProfilePhoto: Boolean(profilePhotoStorageKey),
        profilePhotoStorageKey,
        profilePhotoUrl: await this.presignProfilePhoto(profilePhotoStorageKey),
      },
      branch: user.branch
        ? {
            id: user.branch.id,
            name: user.branch.name,
            address: user.branch.address,
          }
        : null,
      workspace: {
        id: user.tenant.id,
        name: user.tenant.name,
        status: user.tenant.status,
        currency: user.tenant.currency,
        country: user.tenant.country,
      },
    };
  }

  async presignProfilePhotoUpload(
    userId: string,
    tenantId: string,
    dto: { mimeType: string; extension?: string; fileName?: string },
  ) {
    const mime = dto.mimeType.toLowerCase();
    if (!mime.startsWith('image/')) {
      throw new BadRequestException('Profile photo must be an image.');
    }
    const extension =
      dto.extension ||
      this.extensionFromMime(mime) ||
      this.extensionFromFileName(dto.fileName) ||
      'jpg';
    const storageKey = this.objectStorage.buildAgentProfilePhotoKey({
      tenantId,
      userId,
      extension,
    });
    const presigned = await this.objectStorage.presignPut({
      storageKey,
      mimeType: dto.mimeType,
    });
    return {
      ...presigned,
      mimeType: dto.mimeType,
    };
  }

  async confirmProfilePhoto(
    userId: string,
    tenantId: string,
    dto: { storageKey: string; mimeType: string; byteSize: number },
  ) {
    const mime = dto.mimeType.toLowerCase();
    if (!mime.startsWith('image/')) {
      throw new BadRequestException('Profile photo must be an image.');
    }
    if (dto.byteSize < 1) {
      throw new BadRequestException('Profile photo is empty.');
    }
    const expectedPrefix = `tenants/${tenantId}/agents/${userId}/profile/`;
    if (!dto.storageKey.startsWith(expectedPrefix)) {
      throw new BadRequestException(
        'storageKey does not match this agent profile.',
      );
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        profilePhotoStorageKey: dto.storageKey,
        profilePhotoMimeType: dto.mimeType,
        profilePhotoUpdatedAt: new Date(),
      },
    });

    const profilePhotoUrl = await this.presignProfilePhoto(dto.storageKey);
    return {
      user: {
        id: updated.id,
        hasProfilePhoto: true,
        profilePhotoStorageKey: updated.profilePhotoStorageKey,
        profilePhotoUrl,
      },
    };
  }

  private async presignProfilePhoto(storageKey: string | null | undefined) {
    if (!storageKey) return null;
    try {
      const signed = await this.objectStorage.presignGet({ storageKey });
      return signed.downloadUrl;
    } catch {
      return null;
    }
  }

  private extensionFromMime(mimeType: string) {
    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpg';
    if (mimeType === 'image/png') return 'png';
    if (mimeType === 'image/webp') return 'webp';
    return null;
  }

  private extensionFromFileName(fileName?: string) {
    if (!fileName) return null;
    const parts = fileName.split('.');
    if (parts.length < 2) return null;
    return parts[parts.length - 1]?.toLowerCase() || null;
  }

  private async ensureUserPublicId(userId: string): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = generateAgentPublicId();
      try {
        const updated = await this.prisma.user.update({
          where: { id: userId },
          data: { publicId: candidate },
        });
        if (updated.publicId) return updated.publicId;
      } catch {
        // unique collision — retry
      }
    }
    const fallback = `A-${Date.now().toString().slice(-5)}`;
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { publicId: fallback },
    });
    return updated.publicId!;
  }

  private buildWorkspaceRegistrationResponse(
    result: WorkspaceRegistrationEntities,
    emailDelivery: EmailOtpDeliveryResult,
  ): WorkspaceRegistrationResponse {
    return {
      workspace: {
        id: result.tenant.id,
        name: result.tenant.name,
        status: result.tenant.status,
        currency: result.tenant.currency,
        country: result.tenant.country,
      },
      owner: {
        id: result.owner.id,
        name: result.owner.displayName,
        email: result.owner.email,
        phone: result.owner.phone ?? '',
        status: result.owner.status,
        emailVerified: result.owner.emailVerified,
        phoneVerified: result.owner.phoneVerified,
      },
      emailChallenge: this.toOtpChallengeContract(result.emailChallenge),
      emailDelivery: toPublicOtpDelivery(emailDelivery),
    };
  }

  private async buildWorkspaceVerificationResponse(
    tenant: Tenant,
    owner: User,
  ): Promise<WorkspaceOtpVerificationResponse> {
    const activated =
      tenant.status === TenantStatus.ACTIVE &&
      owner.status === UserStatus.ACTIVE;

    return {
      workspace: {
        id: tenant.id,
        name: tenant.name,
        status: tenant.status,
        currency: tenant.currency,
        country: tenant.country,
      },
      owner: {
        id: owner.id,
        name: owner.displayName,
        email: owner.email,
        phone: owner.phone ?? '',
        status: owner.status,
        emailVerified: owner.emailVerified,
        phoneVerified: owner.phoneVerified,
      },
      verification: {
        emailVerified: owner.emailVerified,
        phoneVerified: owner.phoneVerified,
        activated,
      },
      session: activated ? await this.buildSession(owner.id, tenant.id) : null,
    };
  }

  private toOtpChallengeContract(challenge: OtpChallenge) {
    const lastIssuedAt =
      challenge.lastSentAt ?? challenge.sentAt ?? challenge.createdAt;

    return {
      id: challenge.id,
      channel: challenge.channel,
      destination: challenge.destination,
      expiresAt: challenge.expiresAt,
      resendAvailableAt: this.getResendAvailableAt(lastIssuedAt),
      resendCount: challenge.resendCount,
      maxResends: this.getMaxOtpResends(),
    };
  }

  private async recordOtpDeliveryResult(
    tenantId: string,
    challengeId: string,
    delivery: EmailOtpDeliveryResult,
  ) {
    const topic = delivery.delivered
      ? NOTIFICATION_EVENTS.emailOtpSent
      : NOTIFICATION_EVENTS.emailOtpDeliveryFailed;

    await this.prisma.outboxEvent.create({
      data: {
        tenantId,
        topic,
        aggregateType: 'otp_challenge',
        aggregateId: challengeId,
        payload: {
          challengeId,
          channel: delivery.channel,
          destination: delivery.destination,
          provider: delivery.provider,
          delivered: delivery.delivered,
          message: delivery.message,
        },
      },
    });
  }

  private generateEmailOtpCode(): string {
    const testCode = this.configService.get<string>('AUTH_EMAIL_OTP_TEST_CODE');

    if (
      this.configService.get<string>('NODE_ENV') === 'test' &&
      testCode &&
      /^[0-9]{6}$/.test(testCode)
    ) {
      return testCode;
    }

    return this.otpService.generateCode();
  }

  private getResendAvailableAt(lastIssuedAt: Date): Date {
    return new Date(
      lastIssuedAt.getTime() + this.getOtpResendCooldownSeconds() * 1000,
    );
  }

  private getOtpResendCooldownSeconds(): number {
    return Math.trunc(
      this.getNumericConfig(
        'OTP_RESEND_COOLDOWN_SECONDS',
        OTP_RESEND_COOLDOWN_SECONDS,
      ),
    );
  }

  private getMaxOtpResends(): number {
    return Math.trunc(
      this.getNumericConfig('OTP_MAX_RESENDS', OTP_MAX_RESENDS),
    );
  }

  private getNumericConfig(name: string, fallback: number): number {
    const value = Number(this.configService.get<string>(name));

    if (!Number.isFinite(value) || value < 0) {
      return fallback;
    }

    return value;
  }

  private async assertWorkspaceOwnerIdentityAvailable(
    input: {
      email: string;
      phone: string;
    },
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const [emailUser, phoneUser] = await Promise.all([
      client.user.findFirst({
        where: {
          email: {
            equals: input.email,
            mode: 'insensitive',
          },
        },
        select: {
          id: true,
          tenant: {
            select: {
              status: true,
            },
          },
        },
      }),
      client.user.findFirst({
        where: {
          phone: input.phone,
        },
        select: {
          id: true,
          tenant: {
            select: {
              status: true,
            },
          },
        },
      }),
    ]);

    if (emailUser) {
      const message =
        emailUser.tenant.status === TenantStatus.PENDING_VERIFICATION
          ? 'An account registration is already pending for this email. Verify the existing registration before creating another account.'
          : 'An account with this email already exists. Sign in or use a different email.';
      throw new ConflictException(message);
    }

    if (phoneUser) {
      const message =
        phoneUser.tenant.status === TenantStatus.PENDING_VERIFICATION
          ? 'An account registration is already pending for this phone number. Verify the existing registration before creating another account.'
          : 'An account with this phone number already exists. Sign in or use a different phone number.';
      throw new ConflictException(message);
    }
  }

  private async lockUserIdentity(
    tx: Prisma.TransactionClient,
    input: { email: string; phone: string },
  ) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`user-email:${input.email}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`user-phone:${input.phone}`}))`;
  }

  private throwRegistrationConflictFromDatabaseError(error: unknown) {
    if (!isPrismaUniqueConstraintError(error)) {
      return;
    }

    const targets = getPrismaUniqueConstraintTargets(error);

    if (targets.includes('email')) {
      throw new ConflictException(
        'An account with this email already exists. Sign in or use a different email.',
      );
    }

    if (targets.includes('phone')) {
      throw new ConflictException(
        'An account with this phone number already exists. Sign in or use a different phone number.',
      );
    }

    throw new ConflictException('A conflicting registration already exists.');
  }

  private async buildSession(userId: string, tenantId: string) {
    const tokens = this.jwtTokenService.issueTokenPair({ userId, tenantId });
    const permissions = await this.prisma.userRole.findMany({
      where: { userId },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    return {
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt,
      refreshToken: tokens.refreshToken,
      refreshExpiresAt: tokens.refreshExpiresAt,
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

  async refreshSession(dto: RefreshSessionDto) {
    const payload = this.jwtTokenService.verifyRefreshToken(dto.refreshToken);
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { tenant: true },
    });

    if (
      !user ||
      user.tenantId !== payload.tenantId ||
      user.status !== UserStatus.ACTIVE ||
      user.tenant.status !== TenantStatus.ACTIVE
    ) {
      throw new UnauthorizedException('Unable to refresh session.');
    }

    return {
      session: await this.buildSession(user.id, user.tenantId),
    };
  }
}
