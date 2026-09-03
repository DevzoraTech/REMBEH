import { Injectable } from '@nestjs/common';
import { OtpChannel, OtpPurpose, Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  BRANCH_EVENTS,
  BranchCreatedEventPayload,
  BranchStaffInvitationResentEventPayload,
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
  publicId: string;
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

type RotateStaffInvitationInput = {
  tenantId: string;
  actorUserId: string;
  branchId: string;
  userId: string;
  email: string;
  invitationTokenHash: string;
  invitationExpiresAt: Date;
  issuedAt: Date;
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
          publicId: input.publicId,
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

  findStaffUserForInvitation(input: {
    tenantId: string;
    branchId: string;
    userId: string;
  }) {
    return this.prisma.user.findFirst({
      where: {
        id: input.userId,
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
        },
      },
    });
  }

  rotateStaffInvitation(input: RotateStaffInvitationInput) {
    return this.prisma.$transaction(async (tx) => {
      const openChallenges = await tx.otpChallenge.findMany({
        where: {
          userId: input.userId,
          tenantId: input.tenantId,
          purpose: OtpPurpose.EMPLOYEE_INVITATION,
          channel: OtpChannel.EMAIL,
          consumedAt: null,
        },
        orderBy: { createdAt: 'desc' },
      });

      const current = openChallenges[0] ?? null;
      const staleIds = openChallenges.slice(1).map((row) => row.id);

      if (staleIds.length > 0) {
        await tx.otpChallenge.updateMany({
          where: { id: { in: staleIds } },
          data: { consumedAt: input.issuedAt },
        });
      }

      const challenge = current
        ? await tx.otpChallenge.update({
            where: { id: current.id },
            data: {
              destination: input.email,
              codeHash: input.invitationTokenHash,
              expiresAt: input.invitationExpiresAt,
              attempts: 0,
              lastSentAt: input.issuedAt,
              sentAt: current.sentAt ?? input.issuedAt,
              resendCount: { increment: 1 },
            },
          })
        : await tx.otpChallenge.create({
            data: {
              tenantId: input.tenantId,
              userId: input.userId,
              channel: OtpChannel.EMAIL,
              purpose: OtpPurpose.EMPLOYEE_INVITATION,
              destination: input.email,
              codeHash: input.invitationTokenHash,
              expiresAt: input.invitationExpiresAt,
              sentAt: input.issuedAt,
              lastSentAt: input.issuedAt,
              resendCount: 1,
            },
          });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: BRANCH_PERMISSIONS.staffInvite,
          entityType: 'user',
          entityId: input.userId,
          newValue: {
            userId: input.userId,
            branchId: input.branchId,
            email: input.email,
            resent: true,
            resendCount: challenge.resendCount,
          },
        },
      });

      const payload: BranchStaffInvitationResentEventPayload = {
        branchId: input.branchId,
        invitedUserId: input.userId,
        resentByUserId: input.actorUserId,
        email: input.email,
        resendCount: challenge.resendCount,
      };

      await tx.outboxEvent.create({
        data: {
          tenantId: input.tenantId,
          topic: BRANCH_EVENTS.staffInvitationResent,
          aggregateType: 'user',
          aggregateId: input.userId,
          payload,
        },
      });

      const user = await tx.user.findUniqueOrThrow({
        where: { id: input.userId },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
        },
      });

      return { user, challenge };
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

  transferStaffWithAudit(input: {
    tenantId: string;
    actorUserId: string;
    staffUserId: string;
    fromBranchId: string;
    toBranchId: string;
    fromBranchName: string;
    toBranchName: string;
    staffName: string;
    roleName: string;
    reason: string | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: input.staffUserId },
        data: { branchId: input.toBranchId },
        include: {
          roles: { include: { role: true } },
        },
      });

      await tx.employee.updateMany({
        where: {
          tenantId: input.tenantId,
          userId: input.staffUserId,
        },
        data: { branchId: input.toBranchId },
      });

      await tx.authSession.updateMany({
        where: {
          tenantId: input.tenantId,
          userId: input.staffUserId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
          revokedByUserId: input.actorUserId,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: BRANCH_EVENTS.staffTransferred,
          entityType: 'user',
          entityId: input.staffUserId,
          oldValue: {
            branchId: input.fromBranchId,
            branchName: input.fromBranchName,
          },
          newValue: {
            branchId: input.toBranchId,
            branchName: input.toBranchName,
            staffName: input.staffName,
            roleName: input.roleName,
            reason: input.reason,
          },
        },
      });

      await tx.outboxEvent.create({
        data: {
          tenantId: input.tenantId,
          topic: BRANCH_EVENTS.staffTransferred,
          aggregateType: 'user',
          aggregateId: input.staffUserId,
          payload: {
            userId: input.staffUserId,
            fromBranchId: input.fromBranchId,
            toBranchId: input.toBranchId,
            transferredByUserId: input.actorUserId,
          },
        },
      });

      return user;
    });
  }

  listStaffTransfers(input: { tenantId: string; limit?: number }) {
    return this.prisma.auditLog.findMany({
      where: {
        tenantId: input.tenantId,
        action: BRANCH_EVENTS.staffTransferred,
      },
      include: {
        actor: {
          select: {
            displayName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: input.limit ?? 100,
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
