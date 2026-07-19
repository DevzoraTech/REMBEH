import { Injectable } from '@nestjs/common';
import { OtpChannel, OtpPurpose, Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  BRANCH_EVENTS,
  BranchCreatedEventPayload,
  BranchStaffInvitedEventPayload,
} from './branches.events';
import { BRANCH_PERMISSIONS } from './branches.permissions';

type CreateBranchRecordInput = {
  tenantId: string;
  actorUserId: string;
  name: string;
  address: string;
  gpsLatitude?: number;
  gpsLongitude?: number;
  phone?: string | null;
  workingHours?: Prisma.InputJsonValue;
};

type CreateStaffInvitationRecordInput = {
  tenantId: string;
  actorUserId: string;
  branchId: string;
  email: string;
  displayName: string;
  roleName: string;
  rolePermissionKeys: string[];
  invitationTokenHash: string;
  invitationExpiresAt: Date;
  issuedAt: Date;
};

type AcceptStaffInvitationInput = {
  challengeId: string;
  userId: string;
  passwordHash: string;
  phone: string;
};

export class UserIdentityConflictError extends Error {
  constructor(readonly field: 'email' | 'phone') {
    super(`User ${field} already exists.`);
  }
}

@Injectable()
export class BranchesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByTenantAndName(input: { tenantId: string; name: string }) {
    return this.prisma.branch.findFirst({
      where: {
        tenantId: input.tenantId,
        name: {
          equals: input.name,
          mode: 'insensitive',
        },
      },
      select: { id: true },
    });
  }

  findByTenantAndId(input: { tenantId: string; branchId: string }) {
    return this.prisma.branch.findFirst({
      where: {
        id: input.branchId,
        tenantId: input.tenantId,
      },
      include: {
        tenant: true,
      },
    });
  }

  findUserByTenantAndEmail(input: { tenantId: string; email: string }) {
    return this.prisma.user.findFirst({
      where: {
        tenantId: input.tenantId,
        email: {
          equals: input.email,
          mode: 'insensitive',
        },
      },
      select: { id: true },
    });
  }

  findUserByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: 'insensitive',
        },
      },
      select: { id: true },
    });
  }

  findUserByTenantAndPhone(input: { tenantId: string; phone: string }) {
    return this.prisma.user.findFirst({
      where: {
        tenantId: input.tenantId,
        phone: input.phone,
      },
      select: { id: true },
    });
  }

  findUserByPhone(phone: string) {
    return this.prisma.user.findFirst({
      where: {
        phone,
      },
      select: { id: true },
    });
  }

  listByTenant(tenantId: string) {
    return this.prisma.branch.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  listByTenantWithStaff(tenantId: string) {
    return this.prisma.branch.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: {
        users: {
          include: {
            roles: {
              include: {
                role: true,
              },
            },
            otpChallenges: {
              where: {
                purpose: OtpPurpose.EMPLOYEE_INVITATION,
                channel: OtpChannel.EMAIL,
              },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  findUserBranchId(input: { tenantId: string; userId: string }) {
    return this.prisma.user.findFirst({
      where: {
        id: input.userId,
        tenantId: input.tenantId,
      },
      select: {
        branchId: true,
      },
    });
  }

  listBranchStaff(input: { tenantId: string; branchId: string }) {
    return this.prisma.user.findMany({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
      },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
        otpChallenges: {
          where: {
            purpose: OtpPurpose.EMPLOYEE_INVITATION,
            channel: OtpChannel.EMAIL,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  createWithAuditAndOutbox(input: CreateBranchRecordInput) {
    return this.prisma.$transaction(async (tx) => {
      const branch = await tx.branch.create({
        data: {
          tenantId: input.tenantId,
          name: input.name,
          address: input.address,
          gpsLatitude: input.gpsLatitude,
          gpsLongitude: input.gpsLongitude,
          phone: input.phone || null,
          workingHours: input.workingHours ?? Prisma.JsonNull,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: BRANCH_PERMISSIONS.create,
          entityType: 'branch',
          entityId: branch.id,
          newValue: {
            id: branch.id,
            name: branch.name,
            address: branch.address,
            phone: branch.phone,
          },
        },
      });

      const payload: BranchCreatedEventPayload = {
        branchId: branch.id,
        createdByUserId: input.actorUserId,
        name: branch.name,
      };

      await tx.outboxEvent.create({
        data: {
          tenantId: input.tenantId,
          topic: BRANCH_EVENTS.created,
          aggregateType: 'branch',
          aggregateId: branch.id,
          payload,
        },
      });

      return branch;
    });
  }

  createStaffInvitationWithAuditAndOutbox(
    input: CreateStaffInvitationRecordInput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockUserEmail(tx, input.email);
      await this.assertUserEmailAvailable(tx, input.email);

      await tx.permission.createMany({
        data: input.rolePermissionKeys.map((key) => ({
          tenantId: input.tenantId,
          key,
          moduleKey: key.startsWith('branch.') ? 'workspace' : 'identity',
          description: `Staff permission: ${key}`,
        })),
        skipDuplicates: true,
      });

      const role =
        (await tx.role.findUnique({
          where: {
            tenantId_name: {
              tenantId: input.tenantId,
              name: input.roleName,
            },
          },
        })) ??
        (await tx.role.create({
          data: {
            tenantId: input.tenantId,
            name: input.roleName,
            description: `${input.roleName} branch staff role.`,
            isSystem: true,
          },
        }));

      const permissions = await tx.permission.findMany({
        where: {
          tenantId: input.tenantId,
          key: { in: input.rolePermissionKeys },
        },
        select: { id: true },
      });

      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: role.id,
          permissionId: permission.id,
        })),
        skipDuplicates: true,
      });

      const user = await tx.user.create({
        data: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          email: input.email,
          phone: null,
          displayName: input.displayName,
          status: UserStatus.INVITED,
        },
      });

      await tx.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id,
        },
      });

      const staffUser = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
        },
      });

      const challenge = await tx.otpChallenge.create({
        data: {
          tenantId: input.tenantId,
          userId: user.id,
          channel: OtpChannel.EMAIL,
          purpose: OtpPurpose.EMPLOYEE_INVITATION,
          destination: input.email,
          codeHash: input.invitationTokenHash,
          expiresAt: input.invitationExpiresAt,
          sentAt: input.issuedAt,
          lastSentAt: input.issuedAt,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: BRANCH_PERMISSIONS.staffInvite,
          entityType: 'user',
          entityId: user.id,
          newValue: {
            userId: user.id,
            branchId: input.branchId,
            email: input.email,
            roleName: input.roleName,
          },
        },
      });

      const payload: BranchStaffInvitedEventPayload = {
        branchId: input.branchId,
        invitedUserId: user.id,
        invitedByUserId: input.actorUserId,
        roleName: input.roleName,
        email: input.email,
      };

      await tx.outboxEvent.create({
        data: {
          tenantId: input.tenantId,
          topic: BRANCH_EVENTS.staffInvited,
          aggregateType: 'user',
          aggregateId: user.id,
          payload,
        },
      });

      return { user: staffUser, role, challenge };
    });
  }

  findOpenStaffInvitationByHash(invitationTokenHash: string) {
    return this.prisma.otpChallenge.findFirst({
      where: {
        channel: OtpChannel.EMAIL,
        purpose: OtpPurpose.EMPLOYEE_INVITATION,
        codeHash: invitationTokenHash,
        consumedAt: null,
      },
      include: {
        tenant: true,
        user: {
          include: {
            branch: true,
            roles: {
              include: {
                role: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  acceptStaffInvitationWithProfile(input: AcceptStaffInvitationInput) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockUserPhone(tx, input.phone);
      await this.assertUserPhoneAvailable(tx, input.phone);

      await tx.otpChallenge.update({
        where: { id: input.challengeId },
        data: { consumedAt: new Date() },
      });

      const user = await tx.user.update({
        where: { id: input.userId },
        data: {
          passwordHash: input.passwordHash,
          phone: input.phone,
          emailVerified: true,
          status: UserStatus.ACTIVE,
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

      await tx.outboxEvent.create({
        data: {
          tenantId: user.tenantId,
          topic: BRANCH_EVENTS.staffInvitationAccepted,
          aggregateType: 'user',
          aggregateId: user.id,
          payload: {
            userId: user.id,
            branchId: user.branchId,
          },
        },
      });

      return user;
    });
  }

  listUserPermissionKeys(userId: string) {
    return this.prisma.userRole.findMany({
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
  }

  private async lockUserEmail(tx: Prisma.TransactionClient, email: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`user-email:${email}`}))`;
  }

  private async lockUserPhone(tx: Prisma.TransactionClient, phone: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`user-phone:${phone}`}))`;
  }

  private async assertUserEmailAvailable(
    tx: Prisma.TransactionClient,
    email: string,
  ) {
    const existingUser = await tx.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: 'insensitive',
        },
      },
      select: {
        email: true,
      },
    });

    if (!existingUser) {
      return;
    }

    throw new UserIdentityConflictError('email');
  }

  private async assertUserPhoneAvailable(
    tx: Prisma.TransactionClient,
    phone: string,
  ) {
    const existingUser = await tx.user.findFirst({
      where: { phone },
      select: { phone: true },
    });

    if (!existingUser) {
      return;
    }

    throw new UserIdentityConflictError('phone');
  }
}
