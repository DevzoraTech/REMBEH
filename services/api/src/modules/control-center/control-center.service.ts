import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ControlCenterAdminStatus,
  ControlCenterMessageChannel,
  ControlCenterMessageStatus,
  Prisma,
  UserStatus,
} from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PasswordService } from '../../common/security/password.service';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SmsService } from '../notifications/sms.service';
import type { ControlCenterAdminContext } from './control-center-admin';
import {
  ControlCenterLoginDto,
  ControlCenterSetupDto,
} from './dto/control-center-auth.dto';
import { ControlCenterSendMessageDto } from './dto/control-center-message.dto';
import { ControlCenterSavePricingDto } from './dto/control-center-pricing.dto';
import { ControlCenterUpdateUserStatusDto } from './dto/control-center-users.dto';

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 365 * 10;

const DEFAULT_ALLOWED_EMAILS = [
  'antikra.ug@gmail.com',
  'bonnefilleul@gmail.com',
];

const DEFAULT_TEMPLATES = [
  {
    code: 'subscription_offer_email',
    name: 'Subscription price offer',
    channel: ControlCenterMessageChannel.EMAIL,
    subject: 'Your REMBEH subscription offer',
    body: 'Hello {{name}},\n\nWe have prepared a custom REMBEH subscription offer for {{organization}}. Reply to this email or contact the ANTIKRA team to activate it.\n\nRegards,\nANTIKRA',
  },
  {
    code: 'renewal_reminder_email',
    name: 'Renewal reminder',
    channel: ControlCenterMessageChannel.EMAIL,
    subject: 'REMBEH subscription renewal reminder',
    body: 'Hello {{name}},\n\nYour REMBEH subscription for {{organization}} is due for renewal soon. Please complete payment to avoid service interruption.\n\nRegards,\nANTIKRA',
  },
  {
    code: 'marketing_update_sms',
    name: 'Marketing SMS',
    channel: ControlCenterMessageChannel.SMS,
    subject: null,
    body: 'REMBEH update: {{organization}} can now manage daily operations, salaries, and reports more smoothly. Contact ANTIKRA for help.',
  },
  {
    code: 'subscription_locked_sms',
    name: 'Locked branch SMS',
    channel: ControlCenterMessageChannel.SMS,
    subject: null,
    body: 'REMBEH notice: {{branch}} subscription needs attention. Renew to restore full access. ANTIKRA support is available.',
  },
] as const;

type ControlCenterTokenPayload = {
  typ: 'control-center';
  sub: string;
  email: string;
  iat: number;
  exp: number;
};

type ResolvedMessageRecipient = {
  value: string;
  name: string | null;
  organization: string | null;
  branch: string | null;
};

@Injectable()
export class ControlCenterService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly passwordService: PasswordService,
    private readonly notificationsService: NotificationsService,
    private readonly smsService: SmsService,
  ) {}

  async onModuleInit() {
    await this.ensureAllowedAdmins();
    await this.ensureMessageTemplates();
  }

  async authStatus(email?: string) {
    const allowedEmails = this.allowedEmails();
    const normalized = email ? this.normalizeEmail(email) : null;
    const admin = normalized
      ? await this.prisma.controlCenterAdmin.findUnique({
          where: { email: normalized },
        })
      : null;

    return {
      allowedEmails,
      allowed: normalized ? allowedEmails.includes(normalized) : false,
      setupRequired: Boolean(normalized && !admin?.passwordHash),
      configured: allowedEmails.length > 0,
    };
  }

  async setup(dto: ControlCenterSetupDto) {
    const email = this.assertAllowedEmail(dto.email);
    const existing = await this.prisma.controlCenterAdmin.findUnique({
      where: { email },
    });

    if (existing?.passwordHash) {
      throw new ConflictException(
        'This control center admin is already set up.',
      );
    }

    const passwordHash = await this.passwordService.hashPassword(dto.password);
    const admin = await this.prisma.controlCenterAdmin.upsert({
      where: { email },
      create: {
        email,
        displayName: dto.displayName.trim(),
        passwordHash,
        status: ControlCenterAdminStatus.ACTIVE,
        lastLoginAt: new Date(),
      },
      update: {
        displayName: dto.displayName.trim(),
        passwordHash,
        status: ControlCenterAdminStatus.ACTIVE,
        lastLoginAt: new Date(),
      },
    });

    await this.audit(
      admin.id,
      'control_center.admin.setup',
      'ControlCenterAdmin',
      admin.id,
      null,
      {
        email,
      },
    );

    return this.toAuthResponse(admin);
  }

  async login(dto: ControlCenterLoginDto) {
    const email = this.assertAllowedEmail(dto.email);
    const admin = await this.prisma.controlCenterAdmin.findUnique({
      where: { email },
    });

    if (!admin?.passwordHash) {
      throw new BadRequestException(
        'First-time setup is required for this control center email.',
      );
    }

    if (admin.status !== ControlCenterAdminStatus.ACTIVE) {
      throw new ForbiddenException('This control center admin is suspended.');
    }

    const valid = await this.passwordService.verifyPassword(
      dto.password,
      admin.passwordHash,
    );

    if (!valid) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const updated = await this.prisma.controlCenterAdmin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    return this.toAuthResponse(updated);
  }

  async me(admin: ControlCenterAdminContext) {
    return { admin };
  }

  async verifyAdminToken(token: string): Promise<ControlCenterAdminContext> {
    const payload = this.verifyToken(token);
    const email = this.assertAllowedEmail(payload.email);
    const admin = await this.prisma.controlCenterAdmin.findUnique({
      where: { id: payload.sub },
    });

    if (
      !admin ||
      admin.email !== email ||
      admin.status !== ControlCenterAdminStatus.ACTIVE
    ) {
      throw new UnauthorizedException('Control center login required.');
    }

    return {
      adminId: admin.id,
      email: admin.email,
      displayName: admin.displayName,
    };
  }

  async dashboard() {
    const now = new Date();
    const [
      totalClients,
      activeClients,
      suspendedClients,
      branchCount,
      userCount,
      activeBranches,
      lockedBranches,
      completedPayments,
      activeOverrides,
      recentPayments,
      recentActivity,
    ] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { status: 'ACTIVE' } }),
      this.prisma.tenant.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.branch.count(),
      this.prisma.user.count(),
      this.prisma.branchSubscription.count({ where: { status: 'ACTIVE' } }),
      this.prisma.branchSubscription.count({ where: { status: 'LOCKED' } }),
      this.prisma.subscriptionPayment.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.subscriptionPriceOverride.count({
        where: {
          revokedAt: null,
          effectiveFrom: { lte: now },
          OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }],
        },
      }),
      this.prisma.subscriptionPayment.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: {
          tenant: { select: { name: true } },
          branch: { select: { name: true } },
          plan: { select: { code: true, name: true, interval: true } },
        },
      }),
      this.prisma.controlCenterAuditLog.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: { admin: { select: { displayName: true, email: true } } },
      }),
    ]);

    return {
      stats: {
        totalClients,
        activeClients,
        suspendedClients,
        totalBranches: branchCount,
        totalUsers: userCount,
        activeBranches,
        lockedBranches,
        completedRevenue: this.decimal(completedPayments._sum.amount),
        completedPayments: completedPayments._count._all,
        activePricingOverrides: activeOverrides,
      },
      recentPayments: recentPayments.map((payment) => ({
        id: payment.id,
        organizationName: payment.tenant.name,
        branchName: payment.branch.name,
        amount: this.decimal(payment.amount),
        currency: payment.currency,
        status: payment.status,
        planCode: payment.plan.code,
        createdAt: payment.createdAt.toISOString(),
        paidAt: payment.paidAt?.toISOString() ?? null,
      })),
      recentActivity: recentActivity.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        adminName: row.admin?.displayName ?? row.admin?.email ?? 'System',
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async listClients() {
    const now = new Date();
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        branches: {
          include: {
            subscription: { include: { plan: true } },
          },
          orderBy: { name: 'asc' },
        },
        users: {
          take: 20,
          include: { roles: { include: { role: true } } },
          orderBy: { createdAt: 'asc' },
        },
        subscriptionPriceOverrides: {
          where: {
            revokedAt: null,
            effectiveFrom: { lte: now },
            OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }],
          },
        },
        _count: {
          select: {
            branches: true,
            users: true,
            customers: true,
            loans: true,
            subscriptionPayments: true,
          },
        },
      },
    });

    const rows = tenants.map((tenant) => {
      const owner =
        tenant.users.find((user) =>
          user.roles.some((role) => role.role.name === 'Account Owner'),
        ) ?? tenant.users[0];
      const activeBranches = tenant.branches.filter(
        (branch) => branch.subscription?.status === 'ACTIVE',
      ).length;
      const hasCustomPricing = tenant.subscriptionPriceOverrides.length > 0;

      return {
        id: tenant.id,
        name: tenant.name,
        email: owner?.email ?? null,
        phone: owner?.phone ?? null,
        ownerName: owner?.displayName ?? null,
        branchCount: tenant._count.branches,
        activeBranchCount: activeBranches,
        userCount: tenant._count.users,
        customerCount: tenant._count.customers,
        loanCount: tenant._count.loans,
        pricingType: hasCustomPricing ? 'CUSTOM' : 'DEFAULT',
        status: tenant.status,
        createdAt: tenant.createdAt.toISOString(),
      };
    });

    return {
      stats: {
        totalClients: rows.length,
        customPricing: rows.filter((row) => row.pricingType === 'CUSTOM')
          .length,
        defaultPricing: rows.filter((row) => row.pricingType === 'DEFAULT')
          .length,
        activeClients: rows.filter((row) => row.status === 'ACTIVE').length,
      },
      clients: rows,
    };
  }

  async getClient(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        users: {
          include: { roles: { include: { role: true } } },
          orderBy: { createdAt: 'asc' },
        },
        branches: {
          include: {
            subscription: { include: { plan: true } },
            _count: { select: { users: true, customers: true, loans: true } },
          },
          orderBy: { name: 'asc' },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Client organization not found.');
    }

    const [repaymentGroups, paymentGroups, latestActivity] = await Promise.all([
      this.prisma.repayment.groupBy({
        by: ['branchId'],
        where: { tenantId },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.subscriptionPayment.groupBy({
        by: ['branchId'],
        where: { tenantId, status: 'COMPLETED' },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.auditLog.findMany({
        where: { tenantId },
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { displayName: true, email: true } } },
      }),
    ]);

    const repaymentsByBranch = new Map(
      repaymentGroups.map((row) => [row.branchId, row]),
    );
    const paymentsByBranch = new Map(
      paymentGroups.map((row) => [row.branchId, row]),
    );
    const owner =
      tenant.users.find((user) =>
        user.roles.some((role) => role.role.name === 'Account Owner'),
      ) ?? tenant.users[0];

    return {
      client: {
        id: tenant.id,
        name: tenant.name,
        registrationNumber: tenant.registrationNumber,
        country: tenant.country,
        currency: tenant.currency,
        status: tenant.status,
        createdAt: tenant.createdAt.toISOString(),
        owner: owner
          ? {
              id: owner.id,
              name: owner.displayName,
              email: owner.email,
              phone: owner.phone,
            }
          : null,
        summary: {
          totalBranches: tenant.branches.length,
          activeBranches: tenant.branches.filter(
            (branch) => branch.subscription?.status === 'ACTIVE',
          ).length,
          suspendedBranches: tenant.branches.filter(
            (branch) => branch.subscription?.status === 'LOCKED',
          ).length,
          totalUsers: tenant.users.length,
        },
      },
      branches: tenant.branches.map((branch) => {
        const repayment = repaymentsByBranch.get(branch.id);
        const payment = paymentsByBranch.get(branch.id);
        return {
          id: branch.id,
          name: branch.name,
          address: branch.address,
          phone: branch.phone,
          status: branch.subscription?.status ?? 'TRIAL',
          planCode: branch.subscription?.plan.code ?? null,
          currentPeriodEnd:
            branch.subscription?.currentPeriodEnd?.toISOString() ?? null,
          users: branch._count.users,
          borrowers: branch._count.customers,
          loans: branch._count.loans,
          repaymentsCollected: this.decimal(repayment?._sum.amount),
          repaymentCount: repayment?._count._all ?? 0,
          subscriptionRevenue: this.decimal(payment?._sum.amount),
          subscriptionPayments: payment?._count._all ?? 0,
        };
      }),
      recentActivity: latestActivity.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        actorName: row.actor?.displayName ?? row.actor?.email ?? 'System',
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async getPricing(tenantId: string) {
    await this.assertTenant(tenantId);
    const now = new Date();
    const [plans, branches, overrides] = await Promise.all([
      this.prisma.subscriptionPlan.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.branch.findMany({
        where: { tenantId },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, address: true },
      }),
      this.prisma.subscriptionPriceOverride.findMany({
        where: {
          tenantId,
          revokedAt: null,
          effectiveFrom: { lte: now },
          OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }],
        },
        include: {
          plan: true,
          branch: { select: { id: true, name: true } },
          changedBy: { select: { displayName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      plans: plans.map((plan) => this.toPlan(plan)),
      branches,
      organization: plans.map((plan) => {
        const override = overrides.find(
          (row) => row.planId === plan.id && row.branchId === null,
        );
        return this.toPriceRow(plan, override);
      }),
      branchOverrides: branches.map((branch) => ({
        branch,
        prices: plans.map((plan) => {
          const override = overrides.find(
            (row) => row.planId === plan.id && row.branchId === branch.id,
          );
          const organizationOverride = overrides.find(
            (row) => row.planId === plan.id && row.branchId === null,
          );
          return this.toPriceRow(plan, override, organizationOverride);
        }),
      })),
    };
  }

  async saveOrganizationPricing(
    admin: ControlCenterAdminContext,
    tenantId: string,
    dto: ControlCenterSavePricingDto,
  ) {
    return this.savePricing(admin, tenantId, null, dto);
  }

  async saveBranchPricing(
    admin: ControlCenterAdminContext,
    tenantId: string,
    branchId: string,
    dto: ControlCenterSavePricingDto,
  ) {
    await this.assertBranch(tenantId, branchId);
    return this.savePricing(admin, tenantId, branchId, dto);
  }

  async pricingHistory(tenantId: string) {
    await this.assertTenant(tenantId);
    const [plans, rows] = await Promise.all([
      this.prisma.subscriptionPlan.findMany({ where: { isActive: true } }),
      this.prisma.subscriptionPriceOverride.findMany({
        where: { tenantId },
        include: {
          plan: true,
          branch: { select: { id: true, name: true } },
          changedBy: { select: { displayName: true, email: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const defaults = new Map(
      plans.map((plan) => [plan.id, this.decimal(plan.amount)]),
    );
    const lastAmountByScope = new Map<string, number>();
    const history = rows.map((row) => {
      const scopeKey = `${row.branchId ?? 'org'}:${row.planId}`;
      const oldAmount =
        lastAmountByScope.get(scopeKey) ?? defaults.get(row.planId) ?? 0;
      const newAmount = this.decimal(row.amount);
      lastAmountByScope.set(scopeKey, newAmount);
      return {
        id: row.id,
        scope: row.branchId ? 'BRANCH' : 'ORGANIZATION',
        branch: row.branch
          ? { id: row.branch.id, name: row.branch.name }
          : null,
        planCode: row.plan.code,
        planName: row.plan.name,
        interval: row.plan.interval,
        oldAmount,
        newAmount,
        currency: row.currency,
        effectiveFrom: row.effectiveFrom.toISOString(),
        effectiveUntil: row.effectiveUntil?.toISOString() ?? null,
        revokedAt: row.revokedAt?.toISOString() ?? null,
        reason: row.reason,
        changedBy: row.changedBy.displayName || row.changedBy.email,
        createdAt: row.createdAt.toISOString(),
      };
    });

    return { history: history.reverse() };
  }

  async listUsers() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        tenant: { select: { id: true, name: true, status: true } },
        branch: { select: { id: true, name: true } },
        roles: { include: { role: true } },
      },
    });

    return {
      users: users.map((user) => ({
        id: user.id,
        name: user.displayName,
        email: user.email,
        phone: user.phone,
        publicId: user.publicId,
        status: user.status,
        tenant: user.tenant,
        branch: user.branch,
        roles: user.roles.map((role) => role.role.name),
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      })),
    };
  }

  async updateUserStatus(
    admin: ControlCenterAdminContext,
    userId: string,
    dto: ControlCenterUpdateUserStatusDto,
  ) {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!existing) {
      throw new NotFoundException('User not found.');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: dto.status as UserStatus,
        suspensionReason:
          dto.status === 'SUSPENDED' ? dto.reason?.trim() || null : null,
      },
    });

    await this.audit(
      admin.adminId,
      'control_center.user.status_updated',
      'User',
      userId,
      { status: existing.status },
      { status: updated.status, reason: dto.reason ?? null },
    );

    return { user: { id: updated.id, status: updated.status } };
  }

  async listMessageTemplates() {
    const templates = await this.prisma.controlCenterMessageTemplate.findMany({
      orderBy: [{ channel: 'asc' }, { name: 'asc' }],
    });
    return { templates };
  }

  async sendMessage(
    admin: ControlCenterAdminContext,
    dto: ControlCenterSendMessageDto,
  ) {
    const channel = dto.channel as ControlCenterMessageChannel;
    const recipients = await this.resolveRecipients(dto, channel);
    if (recipients.length === 0) {
      throw new BadRequestException('No recipients matched this message.');
    }

    const logs = [];
    for (const recipient of recipients) {
      const body = this.renderMessageTemplate(dto.body, recipient);
      const subject =
        channel === ControlCenterMessageChannel.EMAIL
          ? this.renderMessageTemplate(
              dto.subject?.trim() || 'REMBEH update',
              recipient,
            )
          : null;
      let status: ControlCenterMessageStatus = ControlCenterMessageStatus.SENT;
      let provider: string | null = null;
      let error: string | null = null;
      let sentAt: Date | null = new Date();

      if (channel === ControlCenterMessageChannel.EMAIL) {
        const result = await this.notificationsService.sendControlCenterEmail({
          to: recipient.value,
          subject: subject!,
          text: body,
        });
        provider = result.provider;
        if (!result.delivered) {
          status = ControlCenterMessageStatus.FAILED;
          error = result.error ?? 'Email provider rejected the message.';
          sentAt = null;
        }
      } else {
        const result = await this.smsService.sendText({
          destination: recipient.value,
          body,
        });
        provider = result.provider;
        if (!result.delivered && result.outcome !== 'accepted') {
          status =
            result.outcome === 'skipped'
              ? ControlCenterMessageStatus.SKIPPED
              : ControlCenterMessageStatus.FAILED;
          error = result.message;
          sentAt = null;
        }
      }

      logs.push(
        await this.prisma.controlCenterMessageLog.create({
          data: {
            tenantId: dto.tenantId ?? null,
            branchId: dto.branchId ?? null,
            createdByAdminId: admin.adminId,
            channel,
            recipient: recipient.value,
            subject,
            body,
            status,
            provider,
            error,
            sentAt,
          },
        }),
      );
    }

    await this.audit(
      admin.adminId,
      'control_center.message.sent',
      'ControlCenterMessageLog',
      null,
      null,
      {
        channel,
        recipients: recipients.length,
        tenantId: dto.tenantId ?? null,
        branchId: dto.branchId ?? null,
      },
    );

    return {
      sent: logs.filter((log) => log.status === ControlCenterMessageStatus.SENT)
        .length,
      failed: logs.filter(
        (log) => log.status === ControlCenterMessageStatus.FAILED,
      ).length,
      skipped: logs.filter(
        (log) => log.status === ControlCenterMessageStatus.SKIPPED,
      ).length,
      logs: logs.map((log) => ({
        id: log.id,
        recipient: log.recipient,
        status: log.status,
        error: log.error,
      })),
    };
  }

  private async savePricing(
    admin: ControlCenterAdminContext,
    tenantId: string,
    branchId: string | null,
    dto: ControlCenterSavePricingDto,
  ) {
    await this.assertTenant(tenantId);
    if (!dto.prices.length) {
      throw new BadRequestException('Add at least one pricing amount.');
    }
    const planCodes = dto.prices.map((row) =>
      row.planCode.trim().toUpperCase(),
    );
    const plans = await this.prisma.subscriptionPlan.findMany({
      where: { code: { in: planCodes }, isActive: true },
    });
    if (plans.length !== planCodes.length) {
      throw new BadRequestException('Choose valid active subscription plans.');
    }
    const planByCode = new Map(plans.map((plan) => [plan.code, plan]));
    const effectiveFrom = dto.effectiveFrom
      ? new Date(dto.effectiveFrom)
      : new Date();
    const effectiveUntil = dto.effectiveUntil
      ? new Date(dto.effectiveUntil)
      : null;
    if (effectiveUntil && effectiveUntil <= effectiveFrom) {
      throw new BadRequestException(
        'Effective until must be after effective from.',
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const rows = [];
      for (const price of dto.prices) {
        const plan = planByCode.get(price.planCode.trim().toUpperCase())!;
        await tx.subscriptionPriceOverride.updateMany({
          where: {
            tenantId,
            branchId,
            planId: plan.id,
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        });
        rows.push(
          await tx.subscriptionPriceOverride.create({
            data: {
              tenantId,
              branchId,
              planId: plan.id,
              amount: new Prisma.Decimal(price.amount),
              currency: plan.currency,
              effectiveFrom,
              effectiveUntil,
              reason: dto.reason.trim(),
              changedByAdminId: admin.adminId,
            },
          }),
        );
      }
      await tx.controlCenterAuditLog.create({
        data: {
          adminId: admin.adminId,
          action: branchId
            ? 'control_center.pricing.branch_updated'
            : 'control_center.pricing.organization_updated',
          entityType: branchId ? 'Branch' : 'Tenant',
          entityId: branchId ?? tenantId,
          newValue: {
            tenantId,
            branchId,
            prices: dto.prices.map((price) => ({
              planCode: price.planCode,
              amount: price.amount,
            })),
            reason: dto.reason,
            effectiveFrom: effectiveFrom.toISOString(),
            effectiveUntil: effectiveUntil?.toISOString() ?? null,
          },
        },
      });
      return rows;
    });

    return {
      saved: created.map((row) => ({
        id: row.id,
        tenantId: row.tenantId,
        branchId: row.branchId,
        amount: this.decimal(row.amount),
      })),
    };
  }

  private async resolveRecipients(
    dto: ControlCenterSendMessageDto,
    channel: ControlCenterMessageChannel,
  ) {
    if (dto.recipients?.length) {
      return [
        ...new Set(
          dto.recipients
            .map((recipient) => recipient.trim())
            .filter((recipient) => recipient.length > 0),
        ),
      ].map((recipient) => ({
        value: recipient,
        name: null,
        organization: null,
        branch: null,
      }));
    }

    if (!dto.tenantId) {
      throw new BadRequestException(
        'Choose recipients directly or select a client organization.',
      );
    }

    const where: Prisma.UserWhereInput = {
      tenantId: dto.tenantId,
      ...(dto.branchId ? { branchId: dto.branchId } : {}),
      status: UserStatus.ACTIVE,
      ...(channel === ControlCenterMessageChannel.EMAIL
        ? { email: { not: '' } }
        : { phone: { not: null } }),
    };

    if (dto.audience === 'TENANT_OWNERS') {
      where.roles = { some: { role: { name: 'Account Owner' } } };
    }

    const users = await this.prisma.user.findMany({
      where,
      take: 200,
      orderBy: { createdAt: 'asc' },
      select: {
        displayName: true,
        email: true,
        phone: true,
        tenant: { select: { name: true } },
        branch: { select: { name: true } },
      },
    });

    const unique = new Map<string, ResolvedMessageRecipient>();
    for (const user of users) {
      const value =
        channel === ControlCenterMessageChannel.EMAIL
          ? user.email.trim()
          : (user.phone ?? '').trim();
      if (!value || unique.has(value)) continue;
      unique.set(value, {
        value,
        name: user.displayName,
        organization: user.tenant.name,
        branch: user.branch?.name ?? null,
      });
    }
    return [...unique.values()];
  }

  private renderMessageTemplate(
    template: string,
    recipient: ResolvedMessageRecipient,
  ) {
    const values: Record<string, string> = {
      name:
        recipient.name ?? recipient.organization ?? recipient.branch ?? 'there',
      organization: recipient.organization ?? 'your organization',
      branch: recipient.branch ?? 'your branch',
    };

    return template.replace(
      /\{\{\s*(name|organization|branch)\s*\}\}/gi,
      (match, key: string) => values[key.toLowerCase()] ?? match,
    );
  }

  private async ensureAllowedAdmins() {
    for (const email of this.allowedEmails()) {
      await this.prisma.controlCenterAdmin.upsert({
        where: { email },
        create: {
          email,
          displayName: this.defaultNameForEmail(email),
          status: ControlCenterAdminStatus.ACTIVE,
        },
        update: {},
      });
    }
  }

  private async ensureMessageTemplates() {
    for (const template of DEFAULT_TEMPLATES) {
      await this.prisma.controlCenterMessageTemplate.upsert({
        where: { code: template.code },
        create: template,
        update: {
          name: template.name,
          channel: template.channel,
          subject: template.subject,
          body: template.body,
          isSystem: true,
        },
      });
    }
  }

  private async assertTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) {
      throw new NotFoundException('Client organization not found.');
    }
  }

  private async assertBranch(tenantId: string, branchId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenantId },
      select: { id: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found for this organization.');
    }
  }

  private toAuthResponse(admin: {
    id: string;
    email: string;
    displayName: string;
    status: ControlCenterAdminStatus;
  }) {
    return {
      admin: {
        id: admin.id,
        email: admin.email,
        displayName: admin.displayName,
        status: admin.status,
      },
      session: {
        tokenType: 'Bearer' as const,
        accessToken: this.issueToken(admin),
        expiresAt: new Date(
          Date.now() + TOKEN_TTL_SECONDS * 1000,
        ).toISOString(),
      },
    };
  }

  private issueToken(admin: { id: string; email: string }) {
    const now = Math.floor(Date.now() / 1000);
    const payload: ControlCenterTokenPayload = {
      typ: 'control-center',
      sub: admin.id,
      email: admin.email,
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
    };
    const encodedHeader = this.encodeJson({ alg: 'HS256', typ: 'JWT' });
    const encodedPayload = this.encodeJson(payload);
    const signature = this.sign(encodedHeader, encodedPayload);
    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  private verifyToken(token: string): ControlCenterTokenPayload {
    const [encodedHeader, encodedPayload, signature] = token.split('.');
    if (!encodedHeader || !encodedPayload || !signature) {
      throw new UnauthorizedException('Invalid control center token.');
    }
    const expected = this.sign(encodedHeader, encodedPayload);
    const provided = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      provided.length !== expectedBuffer.length ||
      !timingSafeEqual(provided, expectedBuffer)
    ) {
      throw new UnauthorizedException('Invalid control center token.');
    }
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as ControlCenterTokenPayload;
    if (
      payload.typ !== 'control-center' ||
      !payload.sub ||
      !payload.email ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      throw new UnauthorizedException('Invalid control center token.');
    }
    return payload;
  }

  private sign(encodedHeader: string, encodedPayload: string) {
    return createHmac('sha256', this.tokenSecret())
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');
  }

  private tokenSecret() {
    return (
      this.configService.get<string>('CONTROL_CENTER_JWT_SECRET')?.trim() ||
      this.configService.get<string>('JWT_ACCESS_SECRET')?.trim() ||
      this.configService.get<string>('JWT_SECRET')?.trim() ||
      'rembeh-control-center-development-secret'
    );
  }

  private encodeJson(value: unknown) {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }

  private assertAllowedEmail(email: string) {
    const normalized = this.normalizeEmail(email);
    if (!this.allowedEmails().includes(normalized)) {
      throw new ForbiddenException(
        'This email is not allowed in the control center.',
      );
    }
    return normalized;
  }

  private allowedEmails() {
    const configured = this.configService
      .get<string>('CONTROL_CENTER_ALLOWED_EMAILS')
      ?.split(',')
      .map((email) => this.normalizeEmail(email))
      .filter(Boolean);
    return configured?.length ? configured : DEFAULT_ALLOWED_EMAILS;
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private defaultNameForEmail(email: string) {
    if (email === 'antikra.ug@gmail.com') return 'Hamza Mpango';
    if (email === 'bonnefilleul@gmail.com') return 'Bonny Kapere';
    return email.split('@')[0] || 'Control Center Admin';
  }

  private toPlan(plan: {
    id: string;
    code: string;
    name: string;
    amount: Prisma.Decimal | number;
    currency: string;
    interval: string;
  }) {
    return {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      amount: this.decimal(plan.amount),
      currency: plan.currency,
      interval: plan.interval,
    };
  }

  private toPriceRow(
    plan: {
      id: string;
      code: string;
      name: string;
      amount: Prisma.Decimal | number;
      currency: string;
      interval: string;
    },
    override?: {
      id: string;
      amount: Prisma.Decimal | number;
      currency: string;
      reason: string;
      effectiveFrom: Date;
      effectiveUntil: Date | null;
      changedBy: { displayName: string; email: string };
    },
    fallbackOverride?: { amount: Prisma.Decimal | number },
  ) {
    return {
      plan: this.toPlan(plan),
      defaultAmount: this.decimal(plan.amount),
      inheritedAmount: fallbackOverride
        ? this.decimal(fallbackOverride.amount)
        : null,
      effectiveAmount: this.decimal(
        override?.amount ?? fallbackOverride?.amount ?? plan.amount,
      ),
      override: override
        ? {
            id: override.id,
            amount: this.decimal(override.amount),
            currency: override.currency,
            reason: override.reason,
            effectiveFrom: override.effectiveFrom.toISOString(),
            effectiveUntil: override.effectiveUntil?.toISOString() ?? null,
            changedBy:
              override.changedBy.displayName || override.changedBy.email,
          }
        : null,
    };
  }

  private async audit(
    adminId: string | null,
    action: string,
    entityType: string,
    entityId: string | null,
    oldValue: Prisma.InputJsonValue | null,
    newValue: Prisma.InputJsonValue | null,
  ) {
    await this.prisma.controlCenterAuditLog.create({
      data: {
        adminId,
        action,
        entityType,
        entityId,
        ...(oldValue === null ? {} : { oldValue }),
        ...(newValue === null ? {} : { newValue }),
      },
    });
  }

  private decimal(value: Prisma.Decimal | number | null | undefined) {
    if (value == null) return 0;
    return Number(value);
  }
}
