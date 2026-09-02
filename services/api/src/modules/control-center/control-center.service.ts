import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ControlCenterAdminStatus,
  ControlCenterMessageChannel,
  ControlCenterMessageStatus,
  BranchSubscriptionStatus,
  ControlledFeatureScope,
  Prisma,
  SmsBundleStatus,
  SmsPurchaseStatus,
  SubscriptionPaymentStatus,
  UserStatus,
} from '@prisma/client';
import { ControlCenterUpdateMessageTemplateDto } from './dto/control-center-settings.dto';
import { ControlCenterAuditQueryDto } from './dto/control-center-audit-query.dto';
import { ControlCenterReportQueryDto } from './dto/control-center-report-query.dto';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PasswordService } from '../../common/security/password.service';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SmsService } from '../notifications/sms.service';
import { BillingService } from '../billing/billing.service';
import type { ControlCenterAdminContext } from './control-center-admin';
import {
  ControlCenterChangePasswordDto,
  ControlCenterLoginDto,
  ControlCenterSetupDto,
} from './dto/control-center-auth.dto';
import { ControlCenterMessageQueryDto } from './dto/control-center-message-query.dto';
import { ControlCenterFeatureAccessDto } from './dto/control-center-feature-access.dto';
import { ControlCenterSendMessageDto } from './dto/control-center-message.dto';
import { ControlCenterSavePricingDto } from './dto/control-center-pricing.dto';
import { ControlCenterUpdateUserStatusDto } from './dto/control-center-users.dto';
import { DEFAULT_CONTROL_CENTER_MESSAGE_TEMPLATES } from './control-center-message-templates';

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 365 * 10;

const DEFAULT_ALLOWED_EMAILS = [
  'antikra.ug@gmail.com',
  'bonnefilleul@gmail.com',
];

const LEGACY_DATA_CORRECTION_FEATURE = 'legacy_data_corrections';

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
  private readonly logger = new Logger(ControlCenterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly passwordService: PasswordService,
    private readonly notificationsService: NotificationsService,
    private readonly smsService: SmsService,
    private readonly billingService: BillingService,
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
  async controlCenterSettings() {
    const allowedEmails = this.allowedEmails();

    const [admins, templates, plans] = await Promise.all([
      this.prisma.controlCenterAdmin.findMany({
        orderBy: [
          {
            status: 'asc',
          },
          {
            displayName: 'asc',
          },
        ],
        select: {
          id: true,
          email: true,
          displayName: true,
          passwordHash: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),

      this.prisma.controlCenterMessageTemplate.findMany({
        orderBy: [
          {
            channel: 'asc',
          },
          {
            name: 'asc',
          },
        ],
      }),

      this.prisma.subscriptionPlan.findMany({
        orderBy: {
          createdAt: 'asc',
        },
      }),
    ]);

    const adminByEmail = new Map(
      admins.map((admin) => [this.normalizeEmail(admin.email), admin]),
    );

    const configuredAllowedEmails =
      this.configService
        .get<string>('CONTROL_CENTER_ALLOWED_EMAILS')
        ?.split(',')
        .map((email) => this.normalizeEmail(email))
        .filter(Boolean) ?? [];

    const mtnMerchantCode =
      this.configService.get<string>('MTN_MOMO_MERCHANT_CODE')?.trim() || null;

    const mtnAccountName =
      this.configService.get<string>('MTN_MOMO_ACCOUNT_NAME')?.trim() || null;

    const airtelMerchantCode =
      this.configService.get<string>('AIRTEL_MONEY_MERCHANT_CODE')?.trim() ||
      null;

    const airtelAccountName =
      this.configService.get<string>('AIRTEL_MONEY_ACCOUNT_NAME')?.trim() ||
      null;

    const jwtSecretConfigured = Boolean(
      this.configService.get<string>('CONTROL_CENTER_JWT_SECRET')?.trim(),
    );

    return {
      administrators: allowedEmails.map((email) => {
        const admin = adminByEmail.get(email);

        return {
          email,

          displayName:
            admin?.displayName ?? this.allowedAdminDisplayName(email),

          adminId: admin?.id ?? null,

          status: admin?.status ?? 'NOT_SETUP',

          setupComplete: Boolean(admin?.passwordHash),

          lastLoginAt: admin?.lastLoginAt?.toISOString() ?? null,

          createdAt: admin?.createdAt?.toISOString() ?? null,

          updatedAt: admin?.updatedAt?.toISOString() ?? null,
        };
      }),

      accessConfiguration: {
        source: configuredAllowedEmails.length > 0 ? 'ENVIRONMENT' : 'DEFAULT',

        allowedCount: allowedEmails.length,

        jwtSecretConfigured,
      },

      templates: templates.map((template) => ({
        id: template.id,

        code: template.code,

        name: template.name,

        channel: template.channel,

        subject: template.subject,

        body: template.body,

        isSystem: template.isSystem,

        createdAt: template.createdAt.toISOString(),

        updatedAt: template.updatedAt.toISOString(),
      })),

      plans: plans.map((plan) => ({
        id: plan.id,

        code: plan.code,

        name: plan.name,

        amount: this.decimal(plan.amount),

        currency: plan.currency,

        interval: plan.interval,

        isActive: plan.isActive,

        createdAt: plan.createdAt.toISOString(),

        updatedAt: plan.updatedAt.toISOString(),
      })),

      billing: {
        providers: [
          {
            provider: 'MTN_MOMO',

            label: 'MTN Mobile Money',

            merchantCode: mtnMerchantCode,

            accountName: mtnAccountName,

            configured: Boolean(mtnMerchantCode && mtnAccountName),
          },

          {
            provider: 'AIRTEL_MONEY',

            label: 'Airtel Money',

            merchantCode: airtelMerchantCode,

            accountName: airtelAccountName,

            configured: Boolean(airtelMerchantCode && airtelAccountName),
          },
        ],
      },
    };
  }

  async updateMessageTemplate(
    admin: ControlCenterAdminContext,
    templateId: string,
    dto: ControlCenterUpdateMessageTemplateDto,
  ) {
    const existing = await this.prisma.controlCenterMessageTemplate.findUnique({
      where: {
        id: templateId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Message template not found.');
    }

    const updated = await this.prisma.controlCenterMessageTemplate.update({
      where: {
        id: templateId,
      },

      data: {
        ...(dto.name !== undefined
          ? {
              name: dto.name.trim(),
            }
          : {}),

        ...(dto.subject !== undefined
          ? {
              subject: dto.subject.trim() || null,
            }
          : {}),

        body: dto.body.trim(),
      },
    });

    await this.audit(
      admin.adminId,
      'control_center.message_template.updated',
      'ControlCenterMessageTemplate',
      updated.id,
      {
        name: existing.name,

        subject: existing.subject,

        body: existing.body,
      },
      {
        name: updated.name,

        subject: updated.subject,

        body: updated.body,
      },
    );

    return {
      template: {
        id: updated.id,

        code: updated.code,

        name: updated.name,

        channel: updated.channel,

        subject: updated.subject,

        body: updated.body,

        isSystem: updated.isSystem,

        createdAt: updated.createdAt.toISOString(),

        updatedAt: updated.updatedAt.toISOString(),
      },
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

  async reportsOverview(query: ControlCenterReportQueryDto) {
    const now = new Date();

    const { from, to, previousFrom, previousTo } =
      this.resolveControlCenterReportPeriod(query, now);

    /*
     * Snapshot totals describe the platform as it exists now.
     *
     * Period metrics describe activity that occurred inside
     * the selected reporting period.
     */
    const [
      totalOrganizations,
      totalBranches,
      totalUsers,
      totalBorrowers,
      totalLoans,

      allRepayments,
      allSubscriptionPayments,

      currentBorrowers,
      currentLoans,
      currentRepayments,
      currentSubscriptionPayments,
      currentOrganizations,
      currentBranches,

      previousBorrowers,
      previousLoans,
      previousRepayments,
      previousSubscriptionPayments,
      previousOrganizations,
      previousBranches,
    ] = await Promise.all([
      /*
       * CURRENT PLATFORM SNAPSHOT
       */
      this.prisma.tenant.count(),

      this.prisma.branch.count(),

      this.prisma.user.count(),

      this.prisma.customer.count(),

      /*
       * A loan belongs in the operational portfolio once it has
       * actually been disbursed.
       */
      this.prisma.loan.count({
        where: {
          disbursedAt: {
            not: null,
          },
        },
      }),

      this.prisma.repayment.aggregate({
        _sum: {
          amount: true,
        },
        _count: {
          _all: true,
        },
      }),

      this.prisma.subscriptionPayment.aggregate({
        where: {
          status: 'COMPLETED',
        },
        _sum: {
          amount: true,
        },
        _count: {
          _all: true,
        },
      }),

      /*
       * CURRENT PERIOD
       */
      this.prisma.customer.findMany({
        where: {
          createdAt: {
            gte: from,
            lte: to,
          },
        },
        select: {
          id: true,
          tenantId: true,
          branchId: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      }),

      this.prisma.loan.findMany({
        where: {
          disbursedAt: {
            gte: from,
            lte: to,
          },
        },
        select: {
          id: true,
          tenantId: true,
          branchId: true,
          principal: true,
          disbursedAt: true,
        },
        orderBy: {
          disbursedAt: 'asc',
        },
      }),

      this.prisma.repayment.findMany({
        where: {
          paidAt: {
            gte: from,
            lte: to,
          },
        },
        select: {
          id: true,
          tenantId: true,
          branchId: true,
          amount: true,
          paidAt: true,
        },
        orderBy: {
          paidAt: 'asc',
        },
      }),

      this.prisma.subscriptionPayment.findMany({
        where: {
          status: 'COMPLETED',

          paidAt: {
            gte: from,
            lte: to,
          },
        },
        select: {
          id: true,
          tenantId: true,
          branchId: true,
          amount: true,
          currency: true,
          paidAt: true,
        },
        orderBy: {
          paidAt: 'asc',
        },
      }),

      this.prisma.tenant.findMany({
        where: {
          createdAt: {
            gte: from,
            lte: to,
          },
        },
        select: {
          id: true,
          createdAt: true,
        },
      }),

      this.prisma.branch.findMany({
        where: {
          createdAt: {
            gte: from,
            lte: to,
          },
        },
        select: {
          id: true,
          tenantId: true,
          createdAt: true,
        },
      }),

      /*
       * PREVIOUS PERIOD
       */
      this.prisma.customer.findMany({
        where: {
          createdAt: {
            gte: previousFrom,
            lte: previousTo,
          },
        },
        select: {
          id: true,
          tenantId: true,
          branchId: true,
          createdAt: true,
        },
      }),

      this.prisma.loan.findMany({
        where: {
          disbursedAt: {
            gte: previousFrom,
            lte: previousTo,
          },
        },
        select: {
          id: true,
          tenantId: true,
          branchId: true,
          principal: true,
          disbursedAt: true,
        },
      }),

      this.prisma.repayment.findMany({
        where: {
          paidAt: {
            gte: previousFrom,
            lte: previousTo,
          },
        },
        select: {
          id: true,
          tenantId: true,
          branchId: true,
          amount: true,
          paidAt: true,
        },
      }),

      this.prisma.subscriptionPayment.findMany({
        where: {
          status: 'COMPLETED',

          paidAt: {
            gte: previousFrom,
            lte: previousTo,
          },
        },
        select: {
          id: true,
          tenantId: true,
          branchId: true,
          amount: true,
          paidAt: true,
        },
      }),

      this.prisma.tenant.findMany({
        where: {
          createdAt: {
            gte: previousFrom,
            lte: previousTo,
          },
        },
        select: {
          id: true,
          createdAt: true,
        },
      }),

      this.prisma.branch.findMany({
        where: {
          createdAt: {
            gte: previousFrom,
            lte: previousTo,
          },
        },
        select: {
          id: true,
          tenantId: true,
          createdAt: true,
        },
      }),
    ]);

    const currentRepaymentAmount = currentRepayments.reduce(
      (sum, row) => sum + this.decimal(row.amount),
      0,
    );

    const currentSubscriptionRevenue = currentSubscriptionPayments.reduce(
      (sum, row) => sum + this.decimal(row.amount),
      0,
    );

    const currentPrincipalDisbursed = currentLoans.reduce(
      (sum, row) => sum + this.decimal(row.principal),
      0,
    );

    const previousRepaymentAmount = previousRepayments.reduce(
      (sum, row) => sum + this.decimal(row.amount),
      0,
    );

    const previousSubscriptionRevenue = previousSubscriptionPayments.reduce(
      (sum, row) => sum + this.decimal(row.amount),
      0,
    );

    const previousPrincipalDisbursed = previousLoans.reduce(
      (sum, row) => sum + this.decimal(row.principal),
      0,
    );

    /*
     * Build the daily timeline.
     *
     * This is done here rather than pretending Prisma groupBy can
     * automatically bucket timestamps by calendar day.
     */
    const trendMap = new Map<
      string,
      {
        date: string;
        borrowers: number;
        loans: number;
        principalDisbursed: number;
        repaymentCount: number;
        repaymentsCollected: number;
        subscriptionPayments: number;
        subscriptionRevenue: number;
      }
    >();

    const ensureDay = (value: Date) => {
      const key = this.controlCenterReportDateKey(value);

      const existing = trendMap.get(key);

      if (existing) {
        return existing;
      }

      const created = {
        date: key,
        borrowers: 0,
        loans: 0,
        principalDisbursed: 0,
        repaymentCount: 0,
        repaymentsCollected: 0,
        subscriptionPayments: 0,
        subscriptionRevenue: 0,
      };

      trendMap.set(key, created);

      return created;
    };

    /*
     * Create every day even when nothing happened.
     *
     * Otherwise charts would skip quiet days and visually misrepresent
     * the passage of time.
     */
    const cursor = new Date(
      from.getFullYear(),
      from.getMonth(),
      from.getDate(),
    );

    const lastDay = new Date(to.getFullYear(), to.getMonth(), to.getDate());

    while (cursor.getTime() <= lastDay.getTime()) {
      ensureDay(cursor);

      cursor.setDate(cursor.getDate() + 1);
    }

    for (const borrower of currentBorrowers) {
      const day = ensureDay(borrower.createdAt);

      day.borrowers += 1;
    }

    for (const loan of currentLoans) {
      if (!loan.disbursedAt) {
        continue;
      }

      const day = ensureDay(loan.disbursedAt);

      day.loans += 1;

      day.principalDisbursed += this.decimal(loan.principal);
    }

    for (const repayment of currentRepayments) {
      const day = ensureDay(repayment.paidAt);

      day.repaymentCount += 1;

      day.repaymentsCollected += this.decimal(repayment.amount);
    }

    for (const payment of currentSubscriptionPayments) {
      if (!payment.paidAt) {
        continue;
      }

      const day = ensureDay(payment.paidAt);

      day.subscriptionPayments += 1;

      day.subscriptionRevenue += this.decimal(payment.amount);
    }

    const trends = [...trendMap.values()].sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    /*
     * Organization-level period performance.
     */
    const tenantIds = new Set<string>();

    for (const row of currentBorrowers) {
      tenantIds.add(row.tenantId);
    }

    for (const row of currentLoans) {
      tenantIds.add(row.tenantId);
    }

    for (const row of currentRepayments) {
      tenantIds.add(row.tenantId);
    }

    for (const row of currentSubscriptionPayments) {
      tenantIds.add(row.tenantId);
    }

    const tenants = tenantIds.size
      ? await this.prisma.tenant.findMany({
          where: {
            id: {
              in: [...tenantIds],
            },
          },

          select: {
            id: true,
            name: true,
          },
        })
      : [];

    const tenantNames = new Map(
      tenants.map((tenant) => [tenant.id, tenant.name]),
    );

    const organizationMap = new Map<
      string,
      {
        tenantId: string;
        organizationName: string;
        newBorrowers: number;
        disbursedLoans: number;
        principalDisbursed: number;
        repaymentCount: number;
        repaymentsCollected: number;
        subscriptionPayments: number;
        subscriptionRevenue: number;
      }
    >();

    const organizationRow = (tenantId: string) => {
      const existing = organizationMap.get(tenantId);

      if (existing) {
        return existing;
      }

      const created = {
        tenantId,

        organizationName: tenantNames.get(tenantId) ?? 'Unknown organization',

        newBorrowers: 0,

        disbursedLoans: 0,

        principalDisbursed: 0,

        repaymentCount: 0,

        repaymentsCollected: 0,

        subscriptionPayments: 0,

        subscriptionRevenue: 0,
      };

      organizationMap.set(tenantId, created);

      return created;
    };

    for (const row of currentBorrowers) {
      organizationRow(row.tenantId).newBorrowers += 1;
    }

    for (const row of currentLoans) {
      const organization = organizationRow(row.tenantId);

      organization.disbursedLoans += 1;

      organization.principalDisbursed += this.decimal(row.principal);
    }

    for (const row of currentRepayments) {
      const organization = organizationRow(row.tenantId);

      organization.repaymentCount += 1;

      organization.repaymentsCollected += this.decimal(row.amount);
    }

    for (const row of currentSubscriptionPayments) {
      const organization = organizationRow(row.tenantId);

      organization.subscriptionPayments += 1;

      organization.subscriptionRevenue += this.decimal(row.amount);
    }

    return {
      period: {
        from: from.toISOString(),

        to: to.toISOString(),

        previousFrom: previousFrom.toISOString(),

        previousTo: previousTo.toISOString(),
      },

      /*
       * Platform snapshot.
       */
      totals: {
        organizations: totalOrganizations,

        branches: totalBranches,

        users: totalUsers,

        borrowers: totalBorrowers,

        loans: totalLoans,

        repaymentCount: allRepayments._count._all,

        repaymentsCollected: this.decimal(allRepayments._sum.amount),

        subscriptionPayments: allSubscriptionPayments._count._all,

        subscriptionRevenue: this.decimal(allSubscriptionPayments._sum.amount),
      },

      /*
       * Activity during selected reporting period.
       */
      periodMetrics: {
        newOrganizations: currentOrganizations.length,

        newBranches: currentBranches.length,

        newBorrowers: currentBorrowers.length,

        disbursedLoans: currentLoans.length,

        principalDisbursed: currentPrincipalDisbursed,

        repaymentCount: currentRepayments.length,

        repaymentsCollected: currentRepaymentAmount,

        subscriptionPayments: currentSubscriptionPayments.length,

        subscriptionRevenue: currentSubscriptionRevenue,
      },

      previousPeriod: {
        newOrganizations: previousOrganizations.length,

        newBranches: previousBranches.length,

        newBorrowers: previousBorrowers.length,

        disbursedLoans: previousLoans.length,

        principalDisbursed: previousPrincipalDisbursed,

        repaymentCount: previousRepayments.length,

        repaymentsCollected: previousRepaymentAmount,

        subscriptionPayments: previousSubscriptionPayments.length,

        subscriptionRevenue: previousSubscriptionRevenue,
      },

      trends,

      organizations: [...organizationMap.values()].sort(
        (a, b) => b.repaymentsCollected - a.repaymentsCollected,
      ),
    };
  }

  async listAuditLogs(query: ControlCenterAuditQueryDto) {
    const page = Math.max(1, query.page ?? 1);

    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));

    const where: Prisma.ControlCenterAuditLogWhereInput = {};

    if (query.adminId) {
      where.adminId = query.adminId;
    }

    if (query.action?.trim()) {
      where.action = query.action.trim();
    }

    if (query.entityType?.trim()) {
      where.entityType = query.entityType.trim();
    }

    if (query.category && query.category !== 'ALL') {
      if (query.category === 'SECURITY') {
        where.OR = [
          {
            action: {
              startsWith: 'control_center.user.',
            },
          },
          {
            action: 'control_center.admin.setup',
          },
        ];
      }

      if (query.category === 'COMMERCIAL') {
        where.OR = [
          {
            action: {
              startsWith: 'control_center.pricing.',
            },
          },
        ];
      }

      if (query.category === 'COMMUNICATIONS') {
        where.OR = [
          {
            action: {
              startsWith: 'control_center.message.',
            },
          },
          {
            action: 'control_center.pricing.notification_sent',
          },
          {
            action: 'control_center.pricing.notification_failed',
          },
        ];
      }
    }

    if (query.search?.trim()) {
      const search = query.search.trim();

      const searchConditions: Prisma.ControlCenterAuditLogWhereInput[] = [
        {
          action: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          entityType: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          entityId: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          admin: {
            is: {
              displayName: {
                contains: search,
                mode: 'insensitive',
              },
            },
          },
        },
        {
          admin: {
            is: {
              email: {
                contains: search,
                mode: 'insensitive',
              },
            },
          },
        },
      ];

      if (where.OR) {
        /*
         * Preserve the selected category AND apply search.
         */
        where.AND = [
          {
            OR: where.OR,
          },
          {
            OR: searchConditions,
          },
        ];

        delete where.OR;
      } else {
        where.OR = searchConditions;
      }
    }

    const createdAt: Prisma.DateTimeFilter = {};

    if (query.dateFrom) {
      const date = new Date(query.dateFrom);

      if (!Number.isNaN(date.getTime())) {
        createdAt.gte = date;
      }
    }

    if (query.dateTo) {
      const date = new Date(query.dateTo);

      if (!Number.isNaN(date.getTime())) {
        /*
         * A YYYY-MM-DD query should include the entire selected day.
         */
        if (/^\d{4}-\d{2}-\d{2}$/.test(query.dateTo)) {
          date.setHours(23, 59, 59, 999);
        }

        createdAt.lte = date;
      }
    }

    if (createdAt.gte || createdAt.lte) {
      where.createdAt = createdAt;
    }

    const now = new Date();

    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      total,
      logs,

      filteredSecurity,
      filteredCommercial,
      filteredCommunications,

      platformTotal,
      platformLast24Hours,
      platformSecurity,
      platformCommercial,
      platformCommunications,

      admins,
      actions,
      entityTypes,
    ] = await Promise.all([
      this.prisma.controlCenterAuditLog.count({
        where,
      }),

      this.prisma.controlCenterAuditLog.findMany({
        where,

        include: {
          admin: {
            select: {
              id: true,
              displayName: true,
              email: true,
            },
          },
        },

        orderBy: {
          createdAt: 'desc',
        },

        skip: (page - 1) * pageSize,

        take: pageSize,
      }),

      this.prisma.controlCenterAuditLog.count({
        where: {
          AND: [
            where,
            {
              OR: [
                {
                  action: {
                    startsWith: 'control_center.user.',
                  },
                },
                {
                  action: 'control_center.admin.setup',
                },
              ],
            },
          ],
        },
      }),

      this.prisma.controlCenterAuditLog.count({
        where: {
          AND: [
            where,
            {
              action: {
                startsWith: 'control_center.pricing.',
              },
            },
          ],
        },
      }),

      this.prisma.controlCenterAuditLog.count({
        where: {
          AND: [
            where,
            {
              OR: [
                {
                  action: {
                    startsWith: 'control_center.message.',
                  },
                },
                {
                  action: 'control_center.pricing.notification_sent',
                },
                {
                  action: 'control_center.pricing.notification_failed',
                },
              ],
            },
          ],
        },
      }),

      this.prisma.controlCenterAuditLog.count(),

      this.prisma.controlCenterAuditLog.count({
        where: {
          createdAt: {
            gte: last24Hours,
          },
        },
      }),

      this.prisma.controlCenterAuditLog.count({
        where: {
          OR: [
            {
              action: {
                startsWith: 'control_center.user.',
              },
            },
            {
              action: 'control_center.admin.setup',
            },
          ],
        },
      }),

      this.prisma.controlCenterAuditLog.count({
        where: {
          action: {
            startsWith: 'control_center.pricing.',
          },
        },
      }),

      this.prisma.controlCenterAuditLog.count({
        where: {
          OR: [
            {
              action: {
                startsWith: 'control_center.message.',
              },
            },
            {
              action: 'control_center.pricing.notification_sent',
            },
            {
              action: 'control_center.pricing.notification_failed',
            },
          ],
        },
      }),

      this.prisma.controlCenterAdmin.findMany({
        where: {
          auditLogs: {
            some: {},
          },
        },

        select: {
          id: true,
          displayName: true,
          email: true,
        },

        orderBy: {
          displayName: 'asc',
        },
      }),

      this.prisma.controlCenterAuditLog.findMany({
        distinct: ['action'],

        select: {
          action: true,
        },

        orderBy: {
          action: 'asc',
        },
      }),

      this.prisma.controlCenterAuditLog.findMany({
        distinct: ['entityType'],

        select: {
          entityType: true,
        },

        orderBy: {
          entityType: 'asc',
        },
      }),
    ]);

    return {
      stats: {
        total: platformTotal,

        last24Hours: platformLast24Hours,

        security: platformSecurity,

        commercial: platformCommercial,

        communications: platformCommunications,
      },

      filteredStats: {
        total,

        security: filteredSecurity,

        commercial: filteredCommercial,

        communications: filteredCommunications,
      },

      pagination: {
        page,

        pageSize,

        total,

        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },

      filters: {
        admins: admins.map((admin) => ({
          id: admin.id,

          name: admin.displayName || admin.email,

          email: admin.email,
        })),

        actions: actions.map((row) => row.action),

        entityTypes: entityTypes.map((row) => row.entityType),
      },

      logs: logs.map((row) => ({
        id: row.id,

        action: row.action,

        category: this.controlCenterAuditCategory(row.action),

        entityType: row.entityType,

        entityId: row.entityId,

        oldValue: row.oldValue ?? null,

        newValue: row.newValue ?? null,

        admin: row.admin
          ? {
              id: row.admin.id,

              name: row.admin.displayName || row.admin.email,

              email: row.admin.email,
            }
          : null,

        createdAt: row.createdAt.toISOString(),
      })),
    };
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

  async changePassword(
    admin: ControlCenterAdminContext,
    dto: ControlCenterChangePasswordDto,
  ) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException(
        'New password and confirmation do not match.',
      );
    }

    const record = await this.prisma.controlCenterAdmin.findUnique({
      where: { id: admin.adminId },
      select: { id: true, passwordHash: true },
    });
    if (!record?.passwordHash) {
      throw new NotFoundException('Administrator account not found.');
    }

    const matches = await this.passwordService.verifyPassword(
      dto.currentPassword,
      record.passwordHash,
    );
    if (!matches) {
      throw new BadRequestException('Current password is incorrect.');
    }

    const reused = await this.passwordService.verifyPassword(
      dto.newPassword,
      record.passwordHash,
    );
    if (reused) {
      throw new BadRequestException(
        'New password must be different from your current password.',
      );
    }

    const passwordHash = await this.passwordService.hashPassword(
      dto.newPassword,
    );
    await this.prisma.controlCenterAdmin.update({
      where: { id: record.id },
      data: { passwordHash },
    });

    return { ok: true };
  }

  me(admin: ControlCenterAdminContext) {
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
      failedCommunications,
      recentPayments,
      recentActivity,
    ] = await Promise.all([
      this.prisma.tenant.count(),

      this.prisma.tenant.count({
        where: {
          status: 'ACTIVE',
        },
      }),

      this.prisma.tenant.count({
        where: {
          status: 'SUSPENDED',
        },
      }),

      this.prisma.branch.count(),

      this.prisma.user.count(),

      this.prisma.branchSubscription.count({
        where: {
          status: 'ACTIVE',
        },
      }),

      this.prisma.branchSubscription.count({
        where: {
          status: 'LOCKED',
        },
      }),

      this.prisma.subscriptionPayment.aggregate({
        where: {
          status: 'COMPLETED',
        },
        _sum: {
          amount: true,
        },
        _count: {
          _all: true,
        },
      }),

      this.prisma.subscriptionPriceOverride.count({
        where: {
          revokedAt: null,
          OR: [
            {
              effectiveUntil: null,
            },
            {
              effectiveUntil: {
                gte: now,
              },
            },
          ],
        },
      }),

      /*
       * Only genuine failures belong in the dashboard attention queue.
       * SKIPPED is intentionally excluded because a skipped recipient
       * is not necessarily an operational failure.
       */
      this.prisma.controlCenterMessageLog.count({
        where: {
          status: 'FAILED',
        },
      }),

      this.prisma.subscriptionPayment.findMany({
        take: 8,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          tenant: {
            select: {
              name: true,
            },
          },
          branch: {
            select: {
              name: true,
            },
          },
          plan: {
            select: {
              code: true,
              name: true,
              interval: true,
            },
          },
        },
      }),

      this.prisma.controlCenterAuditLog.findMany({
        take: 8,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          admin: {
            select: {
              displayName: true,
              email: true,
            },
          },
        },
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

        failedCommunications,
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

        adminName: row.admin?.displayName || row.admin?.email || 'System',

        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async listSubscriptions() {
    const now = new Date();
    const [
      branches,
      completedPaymentGroups,
      latestPayments,
      paymentRows,
      plans,
      smsBundles,
    ] =
      await Promise.all([
        this.prisma.branch.findMany({
          orderBy: [{ tenant: { name: 'asc' } }, { name: 'asc' }],
          include: {
            tenant: {
              select: {
                id: true,
                name: true,
                currency: true,
                status: true,
              },
            },
            subscription: {
              include: {
                plan: true,
              },
            },
            _count: {
              select: {
                users: true,
                customers: true,
                loans: true,
              },
            },
            users: {
              select: {
                authSessions: {
                  take: 1,
                  orderBy: { lastSeenAt: 'desc' },
                  select: { lastSeenAt: true },
                },
              },
            },
          },
        }),
        this.prisma.subscriptionPayment.groupBy({
          by: ['branchId'],
          where: { status: SubscriptionPaymentStatus.COMPLETED },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        this.prisma.subscriptionPayment.findMany({
          orderBy: { createdAt: 'desc' },
          include: {
            tenant: { select: { id: true, name: true } },
            branch: { select: { id: true, name: true } },
            plan: { select: { code: true, name: true, interval: true } },
          },
          take: 1000,
        }),
        this.listControlCenterPaymentRows(500),
        this.prisma.subscriptionPlan.findMany({
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.smsBundle.findMany({
          where: { status: { not: SmsBundleStatus.ARCHIVED } },
          orderBy: [{ status: 'asc' }, { priceUgx: 'asc' }],
        }),
      ]);

    const completedByBranch = new Map(
      completedPaymentGroups.map((row) => [row.branchId, row]),
    );
    const latestPaymentByBranch = new Map<
      string,
      (typeof latestPayments)[number]
    >();
    for (const payment of latestPayments) {
      if (!latestPaymentByBranch.has(payment.branchId)) {
        latestPaymentByBranch.set(payment.branchId, payment);
      }
    }

    const records = await Promise.all(
      branches.map(async (branch) => {
        const subscription = branch.subscription;
        const lifecycleStatus = this.subscriptionLifecycleStatus(
          subscription
            ? {
                status: subscription.status,
                currentPeriodEnd: subscription.currentPeriodEnd,
                graceEndsAt: subscription.graceEndsAt,
              }
            : null,
          now,
        );
        const daysRemaining = this.subscriptionDaysRemaining(
          subscription
            ? {
                status: subscription.status,
                currentPeriodEnd: subscription.currentPeriodEnd,
                graceEndsAt: subscription.graceEndsAt,
              }
            : null,
          now,
        );
        const paymentGroup = completedByBranch.get(branch.id);
        const latestPayment = latestPaymentByBranch.get(branch.id) ?? null;
        const lastUsedAt = this.latestDate(
          branch.users.flatMap((user) =>
            user.authSessions.map((session) => session.lastSeenAt),
          ),
        );
        const effectivePrice = subscription?.plan
          ? await this.billingService.resolveEffectivePlanPrice(
              branch.tenantId,
              branch.id,
              subscription.plan,
            )
          : null;

        return {
          id: subscription?.id ?? `branch:${branch.id}`,
          clientId: branch.tenant.id,
          branchId: branch.id,
          organizationName: branch.tenant.name,
          organizationStatus: branch.tenant.status,
          branchName: branch.name,
          branchAddress: branch.address ?? '',
          branchStatus: subscription?.status ?? 'NO_SUBSCRIPTION',
          planCode: subscription?.plan.code ?? null,
          planName: subscription?.plan.name ?? null,
          subscriptionStatus: subscription?.status ?? null,
          currentPeriodStart:
            subscription?.currentPeriodStart?.toISOString() ?? null,
          currentPeriodEnd:
            subscription?.currentPeriodEnd?.toISOString() ?? null,
          graceEndsAt: subscription?.graceEndsAt?.toISOString() ?? null,
          lockedAt: subscription?.lockedAt?.toISOString() ?? null,
          users: branch._count.users,
          borrowers: branch._count.customers,
          loans: branch._count.loans,
          lifecycleStatus,
          daysRemaining,
          currency: effectivePrice?.currency ?? branch.tenant.currency ?? 'UGX',
          effectiveAmount: effectivePrice
            ? this.decimal(effectivePrice.amount)
            : null,
          pricingSource: effectivePrice?.source ?? null,
          priceOverrideId: effectivePrice?.overrideId ?? null,
          lastUsedAt: lastUsedAt?.toISOString() ?? null,
          subscriptionRevenue: this.decimal(paymentGroup?._sum.amount),
          subscriptionPayments: paymentGroup?._count._all ?? 0,
          latestPayment: latestPayment
            ? this.toControlCenterPaymentRow(latestPayment)
            : null,
        };
      }),
    );

    const stats = {
      total: records.length,
      active: records.filter((row) => row.lifecycleStatus === 'ACTIVE').length,
      expiring: records.filter((row) => row.lifecycleStatus === 'EXPIRING')
        .length,
      expired: records.filter((row) => row.lifecycleStatus === 'EXPIRED')
        .length,
      locked: records.filter((row) => row.lifecycleStatus === 'LOCKED').length,
      noSubscription: records.filter(
        (row) => row.lifecycleStatus === 'NO_SUBSCRIPTION',
      ).length,
      attention: records.filter((row) =>
        ['EXPIRING', 'EXPIRED', 'LOCKED', 'NO_SUBSCRIPTION'].includes(
          row.lifecycleStatus,
        ),
      ).length,
    };

    return {
      stats,
      subscriptions: records,
      payments: paymentRows,
      paymentStats: this.controlCenterPaymentStats(paymentRows),
      plans: plans.map((plan) => this.toPlan(plan)),
      smsBundles: smsBundles.map((bundle) => ({
        id: bundle.id,
        code: bundle.code,
        name: bundle.name,
        priceUgx: bundle.priceUgx,
        smsUnits: bundle.smsUnits,
        currency: 'UGX',
        status: bundle.status,
        version: bundle.version,
        activeFrom: bundle.activeFrom.toISOString(),
        activeTo: bundle.activeTo?.toISOString() ?? null,
        effectiveRate: this.decimal(bundle.effectiveRate),
      })),
    };
  }

  async listPayments() {
    const payments = await this.listControlCenterPaymentRows(500);
    const stats = this.controlCenterPaymentStats(payments);

    return {
      stats: {
        total: stats.total,
        pending: stats.pending,
        completed: stats.completed,
        failed: stats.failed,
        completedRevenue: stats.completedRevenue,
        completedPayments: stats.completedPayments,
      },
      payments,
    };
  }

  async verifyPayment(
    admin: ControlCenterAdminContext,
    paymentId: string,
    dto: { kind?: 'subscription' | 'sms'; transactionId?: string },
  ) {
    if (dto.kind === 'sms') {
      const payment =
        await this.billingService.completeManualSmsPaymentFromControlCenter({
          paymentId,
          adminEmail: admin.email,
          transactionId: dto.transactionId,
        });

      await this.audit(
        admin.adminId,
        'control_center.sms_payment.verified',
        'SmsPurchase',
        paymentId,
        null,
        {
          paymentId,
          transactionId: dto.transactionId ?? payment.transactionId ?? null,
        },
      );

      return { payment };
    }

    const payment =
      await this.billingService.completeManualSubscriptionPaymentFromControlCenter(
        {
          paymentId,
          adminEmail: admin.email,
          transactionId: dto.transactionId,
        },
      );

    await this.audit(
      admin.adminId,
      'control_center.payment.verified',
      'SubscriptionPayment',
      paymentId,
      null,
      {
        paymentId,
        transactionId: dto.transactionId ?? payment.transactionId ?? null,
      },
    );

    return { payment };
  }

  async rejectPayment(
    admin: ControlCenterAdminContext,
    paymentId: string,
    dto: { kind?: 'subscription' | 'sms'; reason: string },
  ) {
    const reason = dto.reason.trim();
    if (!reason) {
      throw new BadRequestException('Enter a rejection reason.');
    }

    if (dto.kind === 'sms') {
      const payment =
        await this.billingService.rejectManualSmsPaymentFromControlCenter({
          paymentId,
          adminEmail: admin.email,
          reason,
        });

      await this.audit(
        admin.adminId,
        'control_center.sms_payment.rejected',
        'SmsPurchase',
        paymentId,
        null,
        {
          paymentId,
          reason,
        },
      );

      return { payment };
    }

    const payment =
      await this.billingService.rejectManualSubscriptionPaymentFromControlCenter(
        {
          paymentId,
          adminEmail: admin.email,
          reason,
        },
      );

    await this.audit(
      admin.adminId,
      'control_center.payment.rejected',
      'SubscriptionPayment',
      paymentId,
      null,
      {
        paymentId,
        reason,
      },
    );

    return { payment };
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
          include: {
            branch: { select: { id: true, name: true } },
            roles: { include: { role: true } },
            authSessions: {
              take: 1,
              orderBy: { lastSeenAt: 'desc' },
              select: {
                lastSeenAt: true,
                deviceName: true,
                platform: true,
                revokedAt: true,
                expiresAt: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        branches: {
          include: {
            subscription: { include: { plan: true } },
            _count: { select: { users: true, customers: true, loans: true } },
            users: {
              select: {
                authSessions: {
                  take: 1,
                  orderBy: { lastSeenAt: 'desc' },
                  select: { lastSeenAt: true },
                },
              },
            },
          },
          orderBy: { name: 'asc' },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Client organization not found.');
    }

    const [
      repaymentGroups,
      paymentGroups,
      subscriptionPayments,
      latestActivity,
      dataCorrectionAccess,
    ] = await Promise.all([
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
      this.prisma.subscriptionPayment.findMany({
        where: { tenantId },
        take: 100,
        orderBy: { createdAt: 'desc' },
        include: {
          branch: { select: { id: true, name: true } },
          plan: true,
        },
      }),
      this.prisma.auditLog.findMany({
        where: { tenantId },
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { displayName: true, email: true } } },
      }),
      this.buildDataCorrectionAccess(tenantId, tenant.branches),
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
        dataCorrectionAccess: dataCorrectionAccess.organization,
      },
      branches: tenant.branches.map((branch) => {
        const repayment = repaymentsByBranch.get(branch.id);
        const payment = paymentsByBranch.get(branch.id);
        const branchCorrectionAccess =
          dataCorrectionAccess.branches.find(
            (item) => item.branch.id === branch.id,
          )?.access ?? null;
        const lastUsedAt = this.latestDate(
          branch.users.flatMap((user) =>
            user.authSessions.map((session) => session.lastSeenAt),
          ),
        );
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
          lastUsedAt: lastUsedAt?.toISOString() ?? null,
          dataCorrectionAccess: branchCorrectionAccess,
        };
      }),
      subscriptions: tenant.branches.map((branch) => ({
        id: branch.subscription?.id ?? branch.id,
        branchId: branch.id,
        branchName: branch.name,
        planCode: branch.subscription?.plan.code ?? null,
        planName: branch.subscription?.plan.name ?? null,
        amount: this.decimal(branch.subscription?.plan.amount),
        currency: branch.subscription?.plan.currency ?? tenant.currency,
        status: branch.subscription?.status ?? 'NO_SUBSCRIPTION',
        currentPeriodStart:
          branch.subscription?.currentPeriodStart?.toISOString() ?? null,
        currentPeriodEnd:
          branch.subscription?.currentPeriodEnd?.toISOString() ?? null,
        graceEndsAt: branch.subscription?.graceEndsAt?.toISOString() ?? null,
        lockedAt: branch.subscription?.lockedAt?.toISOString() ?? null,
        lastReminderAt:
          branch.subscription?.lastReminderAt?.toISOString() ?? null,
      })),
      payments: subscriptionPayments.map((payment) => ({
        id: payment.id,
        branch: {
          id: payment.branch.id,
          name: payment.branch.name,
        },
        planCode: payment.plan.code,
        planName: payment.plan.name,
        amount: this.decimal(payment.amount),
        currency: payment.currency,
        status: payment.status,
        merchantReference: payment.merchantReference,
        orderTrackingId: payment.orderTrackingId,
        paidAt: payment.paidAt?.toISOString() ?? null,
        createdAt: payment.createdAt.toISOString(),
      })),
      users: tenant.users.map((user) => {
        const session = user.authSessions[0] ?? null;
        return {
          id: user.id,
          name: user.displayName,
          email: user.email,
          phone: user.phone,
          publicId: user.publicId,
          status: user.status,
          branch: user.branch
            ? {
                id: user.branch.id,
                name: user.branch.name,
              }
            : null,
          roles: user.roles.map((role) => role.role.name),
          lastUsedAt: session?.lastSeenAt.toISOString() ?? null,
          lastUsedDevice: session?.deviceName ?? null,
          lastUsedPlatform: session?.platform ?? null,
          sessionActive: Boolean(session && !session.revokedAt),
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
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

  async getDataCorrectionAccess(tenantId: string) {
    await this.assertTenant(tenantId);

    const branches = await this.prisma.branch.findMany({
      where: { tenantId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    return this.buildDataCorrectionAccess(tenantId, branches);
  }

  async updateOrganizationDataCorrectionAccess(
    admin: ControlCenterAdminContext,
    tenantId: string,
    dto: ControlCenterFeatureAccessDto,
  ) {
    await this.assertTenant(tenantId);

    const oldValue = await this.prisma.controlledFeatureAccess.findUnique({
      where: {
        featureKey_scope_scopeId: {
          featureKey: LEGACY_DATA_CORRECTION_FEATURE,
          scope: ControlledFeatureScope.TENANT,
          scopeId: tenantId,
        },
      },
    });

    const saved = await this.prisma.controlledFeatureAccess.upsert({
      where: {
        featureKey_scope_scopeId: {
          featureKey: LEGACY_DATA_CORRECTION_FEATURE,
          scope: ControlledFeatureScope.TENANT,
          scopeId: tenantId,
        },
      },
      update: {
        enabled: dto.enabled,
        reason: this.cleanOptionalText(dto.reason),
        updatedByAdminId: admin.adminId,
      },
      create: {
        featureKey: LEGACY_DATA_CORRECTION_FEATURE,
        scope: ControlledFeatureScope.TENANT,
        scopeId: tenantId,
        tenantId,
        enabled: dto.enabled,
        reason: this.cleanOptionalText(dto.reason),
        updatedByAdminId: admin.adminId,
      },
    });

    await this.audit(
      admin.adminId,
      'control_center.feature.legacy_data_corrections.updated',
      'ControlledFeatureAccess',
      saved.id,
      this.featureAccessAuditValue(oldValue),
      this.featureAccessAuditValue(saved),
    );

    return this.getDataCorrectionAccess(tenantId);
  }

  async updateBranchDataCorrectionAccess(
    admin: ControlCenterAdminContext,
    tenantId: string,
    branchId: string,
    dto: ControlCenterFeatureAccessDto,
  ) {
    await this.assertBranch(tenantId, branchId);

    const oldValue = await this.prisma.controlledFeatureAccess.findUnique({
      where: {
        featureKey_scope_scopeId: {
          featureKey: LEGACY_DATA_CORRECTION_FEATURE,
          scope: ControlledFeatureScope.BRANCH,
          scopeId: branchId,
        },
      },
    });

    const saved = await this.prisma.controlledFeatureAccess.upsert({
      where: {
        featureKey_scope_scopeId: {
          featureKey: LEGACY_DATA_CORRECTION_FEATURE,
          scope: ControlledFeatureScope.BRANCH,
          scopeId: branchId,
        },
      },
      update: {
        enabled: dto.enabled,
        tenantId,
        branchId,
        reason: this.cleanOptionalText(dto.reason),
        updatedByAdminId: admin.adminId,
      },
      create: {
        featureKey: LEGACY_DATA_CORRECTION_FEATURE,
        scope: ControlledFeatureScope.BRANCH,
        scopeId: branchId,
        tenantId,
        branchId,
        enabled: dto.enabled,
        reason: this.cleanOptionalText(dto.reason),
        updatedByAdminId: admin.adminId,
      },
    });

    await this.audit(
      admin.adminId,
      'control_center.feature.legacy_data_corrections.updated',
      'ControlledFeatureAccess',
      saved.id,
      this.featureAccessAuditValue(oldValue),
      this.featureAccessAuditValue(saved),
    );

    return this.getDataCorrectionAccess(tenantId);
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
        orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
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
        authSessions: {
          take: 1,
          orderBy: { lastSeenAt: 'desc' },
          select: {
            lastSeenAt: true,
            deviceName: true,
            platform: true,
            revokedAt: true,
            expiresAt: true,
          },
        },
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
        lastUsedAt: user.authSessions[0]?.lastSeenAt.toISOString() ?? null,
        lastUsedDevice: user.authSessions[0]?.deviceName ?? null,
        lastUsedPlatform: user.authSessions[0]?.platform ?? null,
        sessionActive:
          user.authSessions[0] != null &&
          !user.authSessions[0].revokedAt &&
          user.authSessions[0].expiresAt.getTime() > Date.now(),
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
        status: dto.status,
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

  async listMessages(query: ControlCenterMessageQueryDto) {
    const page = Math.max(1, query.page ?? 1);

    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));

    /*
     * This where clause affects:
     *
     * - the returned log rows
     * - pagination
     * - filteredStats
     *
     * It MUST NOT affect the platform-wide stats object.
     */
    const where: Prisma.ControlCenterMessageLogWhereInput = {};

    if (query.channel) {
      where.channel = query.channel;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.tenantId) {
      where.tenantId = query.tenantId;
    }

    if (query.branchId) {
      where.branchId = query.branchId;
    }

    if (query.search?.trim()) {
      const search = query.search.trim();

      where.OR = [
        {
          recipient: {
            contains: search,
            mode: 'insensitive',
          },
        },

        {
          subject: {
            contains: search,
            mode: 'insensitive',
          },
        },

        {
          body: {
            contains: search,
            mode: 'insensitive',
          },
        },

        {
          error: {
            contains: search,
            mode: 'insensitive',
          },
        },

        {
          tenant: {
            name: {
              contains: search,
              mode: 'insensitive',
            },
          },
        },

        {
          branch: {
            name: {
              contains: search,
              mode: 'insensitive',
            },
          },
        },
      ];
    }

    const createdAt: Prisma.DateTimeFilter = {};

    if (query.dateFrom) {
      const dateFrom = new Date(query.dateFrom);

      if (!Number.isNaN(dateFrom.getTime())) {
        createdAt.gte = dateFrom;
      }
    }

    if (query.dateTo) {
      const dateTo = new Date(query.dateTo);

      if (!Number.isNaN(dateTo.getTime())) {
        createdAt.lte = dateTo;
      }
    }

    if (createdAt.gte || createdAt.lte) {
      where.createdAt = createdAt;
    }

    const [
      /*
       * GLOBAL statistics.
       *
       * These deliberately have no `where` from the table filters.
       */
      globalTotal,
      globalSent,
      globalFailed,
      globalSkipped,
      globalEmail,
      globalSms,

      /*
       * FILTERED statistics and rows.
       */
      filteredTotal,
      filteredSent,
      filteredFailed,
      filteredSkipped,
      logs,
    ] = await Promise.all([
      /*
       * GLOBAL
       */
      this.prisma.controlCenterMessageLog.count(),

      this.prisma.controlCenterMessageLog.count({
        where: {
          status: 'SENT',
        },
      }),

      this.prisma.controlCenterMessageLog.count({
        where: {
          status: 'FAILED',
        },
      }),

      this.prisma.controlCenterMessageLog.count({
        where: {
          status: 'SKIPPED',
        },
      }),

      this.prisma.controlCenterMessageLog.count({
        where: {
          channel: 'EMAIL',
        },
      }),

      this.prisma.controlCenterMessageLog.count({
        where: {
          channel: 'SMS',
        },
      }),

      /*
       * FILTERED
       */
      this.prisma.controlCenterMessageLog.count({
        where,
      }),

      this.prisma.controlCenterMessageLog.count({
        where: {
          AND: [
            where,
            {
              status: 'SENT',
            },
          ],
        },
      }),

      this.prisma.controlCenterMessageLog.count({
        where: {
          AND: [
            where,
            {
              status: 'FAILED',
            },
          ],
        },
      }),

      this.prisma.controlCenterMessageLog.count({
        where: {
          AND: [
            where,
            {
              status: 'SKIPPED',
            },
          ],
        },
      }),

      this.prisma.controlCenterMessageLog.findMany({
        where,

        include: {
          tenant: {
            select: {
              id: true,
              name: true,
            },
          },

          branch: {
            select: {
              id: true,
              name: true,
            },
          },

          createdBy: {
            select: {
              id: true,
              displayName: true,
              email: true,
            },
          },
        },

        orderBy: {
          createdAt: 'desc',
        },

        skip: (page - 1) * pageSize,

        take: pageSize,
      }),
    ]);

    return {
      /*
       * Platform-wide communications KPIs.
       *
       * These are suitable for the four cards at the top of
       * the Communications Center.
       */
      stats: {
        total: globalTotal,

        sent: globalSent,

        failed: globalFailed,

        skipped: globalSkipped,

        email: globalEmail,

        sms: globalSms,
      },

      /*
       * Statistics corresponding to the currently applied filters.
       *
       * These are useful for filtered result summaries without
       * corrupting the global KPI cards.
       */
      filteredStats: {
        total: filteredTotal,

        sent: filteredSent,

        failed: filteredFailed,

        skipped: filteredSkipped,
      },

      pagination: {
        page,

        pageSize,

        total: filteredTotal,

        totalPages: Math.max(1, Math.ceil(filteredTotal / pageSize)),
      },

      logs: logs.map((log) => ({
        id: log.id,

        tenantId: log.tenantId,

        organizationName: log.tenant?.name ?? null,

        branchId: log.branchId,

        branchName: log.branch?.name ?? null,

        channel: log.channel,

        recipient: log.recipient,

        subject: log.subject,

        body: log.body,

        status: log.status,

        provider: log.provider,

        error: log.error,

        sentAt: log.sentAt?.toISOString() ?? null,

        createdAt: log.createdAt.toISOString(),

        createdBy: {
          id: log.createdBy.id,

          name: log.createdBy.displayName || log.createdBy.email,

          email: log.createdBy.email,
        },
      })),
    };
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
    const channel = dto.channel;
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
          category: this.messageEmailCategory(dto),
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

  private resolveControlCenterReportPeriod(
    query: ControlCenterReportQueryDto,
    now: Date,
  ) {
    const endOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    );

    let from: Date;
    let to = endOfToday;

    const range = query.range ?? '30_DAYS';

    if (range === 'CUSTOM') {
      if (!query.dateFrom || !query.dateTo) {
        throw new BadRequestException(
          'dateFrom and dateTo are required for a custom reporting period.',
        );
      }

      from = new Date(query.dateFrom);

      to = new Date(query.dateTo);

      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        throw new BadRequestException('Invalid reporting date range.');
      }

      from = new Date(from.getFullYear(), from.getMonth(), from.getDate());

      to = new Date(
        to.getFullYear(),
        to.getMonth(),
        to.getDate(),
        23,
        59,
        59,
        999,
      );
    } else if (range === 'THIS_YEAR') {
      from = new Date(now.getFullYear(), 0, 1);
    } else {
      const days = range === '180_DAYS' ? 180 : range === '90_DAYS' ? 90 : 30;

      /*
       * Including today means "30 days" is today plus the previous
       * 29 calendar days.
       */
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      from.setDate(from.getDate() - (days - 1));
    }

    if (to.getTime() < from.getTime()) {
      throw new BadRequestException(
        'Reporting end date must be after the start date.',
      );
    }

    /*
     * Protect this endpoint from accidentally fetching several years
     * of row-level activity into application memory.
     */
    const maxRangeMilliseconds = 366 * 24 * 60 * 60 * 1000;

    if (to.getTime() - from.getTime() > maxRangeMilliseconds) {
      throw new BadRequestException(
        'Reporting periods cannot exceed 366 days.',
      );
    }

    const periodMilliseconds = to.getTime() - from.getTime() + 1;

    const previousTo = new Date(from.getTime() - 1);

    const previousFrom = new Date(
      previousTo.getTime() - periodMilliseconds + 1,
    );

    return {
      from,
      to,
      previousFrom,
      previousTo,
    };
  }

  private controlCenterReportDateKey(value: Date) {
    const year = value.getFullYear();

    const month = String(value.getMonth() + 1).padStart(2, '0');

    const day = String(value.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
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
    const now = new Date();
    if (effectiveUntil && effectiveUntil <= effectiveFrom) {
      throw new BadRequestException(
        'Effective until must be after effective from.',
      );
    }
    const previousAmounts = await this.resolveCurrentPricingAmounts(
      tenantId,
      branchId,
      plans,
    );
    const startsImmediately = effectiveFrom.getTime() <= now.getTime();

    const created = await this.prisma.$transaction(async (tx) => {
      const rows = [];
      for (const price of dto.prices) {
        const plan = planByCode.get(price.planCode.trim().toUpperCase())!;
        const scopedWhere = {
          tenantId,
          branchId,
          planId: plan.id,
          revokedAt: null,
        } satisfies Prisma.SubscriptionPriceOverrideWhereInput;

        if (startsImmediately) {
          await tx.subscriptionPriceOverride.updateMany({
            where: scopedWhere,
            data: { revokedAt: now },
          });
        } else {
          await tx.subscriptionPriceOverride.updateMany({
            where: {
              ...scopedWhere,
              effectiveFrom: { gte: effectiveFrom },
            },
            data: { revokedAt: now },
          });
          await tx.subscriptionPriceOverride.updateMany({
            where: {
              ...scopedWhere,
              effectiveFrom: { lte: now },
              OR: [
                { effectiveUntil: null },
                { effectiveUntil: { gte: effectiveFrom } },
              ],
            },
            data: { effectiveUntil: effectiveFrom },
          });
        }

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
            startsImmediately,
          },
        },
      });
      return rows;
    });
    const notification = await this.notifyPricingChange({
      admin,
      tenantId,
      branchId,
      plans,
      created,
      previousAmounts,
      effectiveFrom,
      effectiveUntil,
      reason: dto.reason.trim(),
    });

    return {
      saved: created.map((row) => ({
        id: row.id,
        tenantId: row.tenantId,
        branchId: row.branchId,
        amount: this.decimal(row.amount),
      })),
      notification,
    };
  }

  private async resolveCurrentPricingAmounts(
    tenantId: string,
    branchId: string | null,
    plans: Array<{
      id: string;
      amount: Prisma.Decimal | number;
      currency: string;
    }>,
  ) {
    const now = new Date();
    const overrides = await this.prisma.subscriptionPriceOverride.findMany({
      where: {
        tenantId,
        planId: { in: plans.map((plan) => plan.id) },
        revokedAt: null,
        effectiveFrom: { lte: now },
        AND: [
          branchId
            ? { OR: [{ branchId }, { branchId: null }] }
            : { branchId: null },
          { OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }] },
        ],
      },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });

    const amounts = new Map<string, number>();
    for (const plan of plans) {
      const branchOverride = branchId
        ? overrides.find(
            (row) => row.planId === plan.id && row.branchId === branchId,
          )
        : null;
      const organizationOverride = overrides.find(
        (row) => row.planId === plan.id && row.branchId === null,
      );
      amounts.set(
        plan.id,
        this.decimal(
          branchOverride?.amount ?? organizationOverride?.amount ?? plan.amount,
        ),
      );
    }
    return amounts;
  }

  private async notifyPricingChange(input: {
    admin: ControlCenterAdminContext;
    tenantId: string;
    branchId: string | null;
    plans: Array<{
      id: string;
      code: string;
      name: string;
      amount: Prisma.Decimal | number;
      currency: string;
    }>;
    created: Array<{
      id: string;
      planId: string;
      amount: Prisma.Decimal | number;
      currency: string;
    }>;
    previousAmounts: Map<string, number>;
    effectiveFrom: Date;
    effectiveUntil: Date | null;
    reason: string;
  }) {
    const [tenant, branch, recipients, branchCount] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: input.tenantId },
        select: { name: true },
      }),
      input.branchId
        ? this.prisma.branch.findFirst({
            where: { id: input.branchId, tenantId: input.tenantId },
            select: { name: true },
          })
        : Promise.resolve(null),
      this.pricingNotificationRecipients(input.tenantId, input.branchId),
      input.branchId
        ? Promise.resolve(1)
        : this.prisma.branch.count({ where: { tenantId: input.tenantId } }),
    ]);

    if (!tenant || recipients.length === 0) {
      return {
        recipients: recipients.length,
        delivered: false,
        error:
          recipients.length === 0 ? 'No owner or manager emails found.' : null,
      };
    }

    const plansById = new Map(input.plans.map((plan) => [plan.id, plan]));
    const priceRows = input.created.map((row) => {
      const plan = plansById.get(row.planId);
      return {
        planName: plan?.name ?? row.planId,
        planCode: plan?.code ?? row.planId,
        oldAmount: input.previousAmounts.get(row.planId) ?? 0,
        newAmount: this.decimal(row.amount),
        currency: row.currency,
      };
    });

    try {
      const result =
        await this.notificationsService.sendSubscriptionPricingChangedEmail({
          recipients: recipients.map((recipient) => recipient.email),
          organizationName: tenant.name,
          branchName: branch?.name ?? null,
          scope: input.branchId ? 'BRANCH' : 'ORGANIZATION',
          affectedBranches: branchCount,
          effectiveFrom: input.effectiveFrom,
          effectiveUntil: input.effectiveUntil,
          reason: input.reason,
          changedBy: input.admin.displayName || input.admin.email,
          prices: priceRows,
        });
      await this.audit(
        input.admin.adminId,
        'control_center.pricing.notification_sent',
        input.branchId ? 'Branch' : 'Tenant',
        input.branchId ?? input.tenantId,
        null,
        {
          recipients: recipients.length,
          delivered: result.delivered,
          error: result.error ?? null,
        },
      );
      return {
        recipients: recipients.length,
        delivered: result.delivered,
        error: result.error ?? null,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Pricing notification could not be sent.';
      this.logger.warn(`Pricing notification failed: ${message}`);
      await this.audit(
        input.admin.adminId,
        'control_center.pricing.notification_failed',
        input.branchId ? 'Branch' : 'Tenant',
        input.branchId ?? input.tenantId,
        null,
        {
          recipients: recipients.length,
          error: message,
        },
      );
      return {
        recipients: recipients.length,
        delivered: false,
        error: message,
      };
    }
  }

  private async pricingNotificationRecipients(
    tenantId: string,
    branchId: string | null,
  ) {
    const ownerRoles = ['Account Owner', 'Owner'];
    const managerRoles = ['Manager', 'Branch Manager'];
    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
        status: UserStatus.ACTIVE,
        email: { not: '' },
        OR: branchId
          ? [
              { roles: { some: { role: { name: { in: ownerRoles } } } } },
              {
                branchId,
                roles: { some: { role: { name: { in: managerRoles } } } },
              },
            ]
          : [
              {
                roles: {
                  some: {
                    role: { name: { in: [...ownerRoles, ...managerRoles] } },
                  },
                },
              },
            ],
      },
      select: { email: true, displayName: true },
      take: 300,
      orderBy: { createdAt: 'asc' },
    });

    const unique = new Map<string, { email: string; name: string }>();
    for (const user of users) {
      const email = user.email.trim().toLowerCase();
      if (!email || unique.has(email)) continue;
      unique.set(email, { email, name: user.displayName });
    }
    return [...unique.values()];
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

    const userIds = [
      ...new Set(
        (dto.userIds ?? [])
          .map((userId) => userId.trim())
          .filter((userId) => userId.length > 0),
      ),
    ];

    if (!dto.tenantId && userIds.length === 0) {
      throw new BadRequestException(
        'Choose recipients directly, select users, or select a client organization.',
      );
    }

    if (dto.audience === 'SELECTED_USERS' && userIds.length === 0) {
      throw new BadRequestException('Choose at least one user.');
    }

    const roleNames = this.normalizeMessageRoleNames(
      dto.audience === 'TENANT_OWNERS'
        ? ['Account Owner']
        : (dto.roleNames ?? []),
    );

    const where: Prisma.UserWhereInput = {
      ...(dto.tenantId ? { tenantId: dto.tenantId } : {}),
      ...(userIds.length ? { id: { in: userIds } } : {}),
      ...(dto.branchId ? { branchId: dto.branchId } : {}),
      status: UserStatus.ACTIVE,
      ...(channel === ControlCenterMessageChannel.EMAIL
        ? { email: { not: '' } }
        : { phone: { not: null } }),
    };

    if (roleNames.length) {
      where.roles = { some: { role: { name: { in: roleNames } } } };
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

  private normalizeMessageRoleNames(roleNames: string[]) {
    const aliases = new Map<string, string[]>([
      ['owner', ['Account Owner', 'Owner']],
      ['account owner', ['Account Owner', 'Owner']],
      ['manager', ['Manager', 'Branch Manager']],
      ['branch manager', ['Manager', 'Branch Manager']],
      ['cashier', ['Cashier']],
      [
        'field officer',
        ['Field Officer', 'Field Agent', 'Agent', 'Loan Officer'],
      ],
      [
        'field agent',
        ['Field Officer', 'Field Agent', 'Agent', 'Loan Officer'],
      ],
      ['agent', ['Field Officer', 'Field Agent', 'Agent', 'Loan Officer']],
      [
        'loan officer',
        ['Field Officer', 'Field Agent', 'Agent', 'Loan Officer'],
      ],
    ]);
    const normalized = new Set<string>();
    for (const item of roleNames) {
      const trimmed = item.trim();
      if (!trimmed) continue;
      const expanded = aliases.get(trimmed.toLowerCase());
      for (const name of expanded ?? [trimmed]) {
        normalized.add(name);
      }
    }
    return [...normalized];
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

  private messageEmailCategory(
    dto: ControlCenterSendMessageDto,
  ): 'billing' | 'marketing' | 'operations' | 'support' {
    const haystack = [dto.templateCode, dto.subject, dto.body]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (
      haystack.includes('price') ||
      haystack.includes('pricing') ||
      haystack.includes('subscription') ||
      haystack.includes('payment') ||
      haystack.includes('renewal')
    ) {
      return 'billing';
    }
    if (
      haystack.includes('operation') ||
      haystack.includes('branch') ||
      haystack.includes('manager')
    ) {
      return 'operations';
    }
    if (haystack.includes('support') || haystack.includes('service')) {
      return 'support';
    }
    return 'marketing';
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
    for (const template of DEFAULT_CONTROL_CENTER_MESSAGE_TEMPLATES) {
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

  private async buildDataCorrectionAccess(
    tenantId: string,
    branches: Array<{ id: string; name: string }>,
  ) {
    const accessRows = await this.prisma.controlledFeatureAccess.findMany({
      where: {
        tenantId,
        featureKey: LEGACY_DATA_CORRECTION_FEATURE,
      },
      include: {
        updatedBy: {
          select: {
            displayName: true,
            email: true,
          },
        },
      },
    });

    const organizationRow =
      accessRows.find((row) => row.scope === ControlledFeatureScope.TENANT) ??
      null;

    const branchRows = new Map(
      accessRows
        .filter((row) => row.scope === ControlledFeatureScope.BRANCH)
        .map((row) => [row.scopeId, row]),
    );

    const organization = this.toFeatureAccessContract(
      organizationRow,
      organizationRow,
      null,
    );

    return {
      featureKey: LEGACY_DATA_CORRECTION_FEATURE,
      organization,
      branches: branches.map((branch) => {
        const branchRow = branchRows.get(branch.id) ?? null;
        return {
          branch,
          access: this.toFeatureAccessContract(
            branchRow,
            branchRow ?? organizationRow,
            organizationRow,
          ),
        };
      }),
    };
  }

  private toFeatureAccessContract(
    ownRow: Prisma.ControlledFeatureAccessGetPayload<{
      include: {
        updatedBy: { select: { displayName: true; email: true } };
      };
    }> | null,
    effectiveRow: Prisma.ControlledFeatureAccessGetPayload<{
      include: {
        updatedBy: { select: { displayName: true; email: true } };
      };
    }> | null,
    organizationRow: Prisma.ControlledFeatureAccessGetPayload<{
      include: {
        updatedBy: { select: { displayName: true; email: true } };
      };
    }> | null,
  ) {
    return {
      enabled: effectiveRow?.enabled ?? false,
      source:
        effectiveRow?.scope === ControlledFeatureScope.BRANCH
          ? 'BRANCH'
          : effectiveRow?.scope === ControlledFeatureScope.TENANT
            ? 'ORGANIZATION'
            : null,
      hasOwnSetting: ownRow != null,
      ownEnabled: ownRow?.enabled ?? null,
      reason: effectiveRow?.reason ?? null,
      organizationEnabled: organizationRow?.enabled ?? null,
      updatedAt: effectiveRow?.updatedAt.toISOString() ?? null,
      updatedBy: effectiveRow?.updatedBy
        ? {
            name:
              effectiveRow.updatedBy.displayName ||
              effectiveRow.updatedBy.email,
            email: effectiveRow.updatedBy.email,
          }
        : null,
    };
  }

  private featureAccessAuditValue(
    row: {
      featureKey: string;
      scope: ControlledFeatureScope;
      scopeId: string;
      tenantId: string;
      branchId: string | null;
      enabled: boolean;
      reason: string | null;
    } | null,
  ): Prisma.InputJsonValue | null {
    if (!row) {
      return null;
    }

    return {
      featureKey: row.featureKey,
      scope: row.scope,
      scopeId: row.scopeId,
      tenantId: row.tenantId,
      branchId: row.branchId,
      enabled: row.enabled,
      reason: row.reason,
    };
  }

  private cleanOptionalText(value: string | null | undefined) {
    const clean = value?.trim() ?? '';
    return clean.length > 0 ? clean : null;
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

  private allowedAdminDisplayName(email: string) {
    if (email === 'antikra.ug@gmail.com') {
      return 'Hamza Mpango';
    }

    if (email === 'bonnefilleul@gmail.com') {
      return 'Bonny Kapere';
    }

    return email;
  }

  private subscriptionLifecycleStatus(
    subscription: {
      status: BranchSubscriptionStatus;
      currentPeriodEnd: Date | null;
      graceEndsAt: Date | null;
    } | null,
    now: Date,
  ) {
    if (!subscription) {
      return 'NO_SUBSCRIPTION';
    }

    if (subscription.status === BranchSubscriptionStatus.LOCKED) {
      return 'LOCKED';
    }

    if (
      subscription.status === BranchSubscriptionStatus.GRACE ||
      subscription.status === BranchSubscriptionStatus.PAST_DUE
    ) {
      if (
        subscription.graceEndsAt &&
        subscription.graceEndsAt.getTime() < now.getTime()
      ) {
        return 'EXPIRED';
      }
      return 'EXPIRING';
    }

    if (!subscription.currentPeriodEnd) {
      return 'ACTIVE';
    }

    const days = this.daysUntil(subscription.currentPeriodEnd, now);
    if (days < 0) {
      return 'EXPIRED';
    }
    if (days <= 14) {
      return 'EXPIRING';
    }
    return 'ACTIVE';
  }

  private subscriptionDaysRemaining(
    subscription: {
      status: BranchSubscriptionStatus;
      currentPeriodEnd: Date | null;
      graceEndsAt: Date | null;
    } | null,
    now: Date,
  ) {
    if (!subscription) {
      return null;
    }

    const target =
      subscription.status === BranchSubscriptionStatus.GRACE ||
      subscription.status === BranchSubscriptionStatus.PAST_DUE
        ? subscription.graceEndsAt
        : subscription.currentPeriodEnd;

    return target ? this.daysUntil(target, now) : null;
  }

  private daysUntil(value: Date, now: Date) {
    return Math.ceil((value.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  }

  private async listControlCenterPaymentRows(take: number) {
    const [subscriptionRows, smsPurchaseRows] = await Promise.all([
      this.prisma.subscriptionPayment.findMany({
        orderBy: { createdAt: 'desc' },
        take,
        include: {
          tenant: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
          plan: { select: { code: true, name: true, interval: true } },
        },
      }),
      this.prisma.smsPurchase.findMany({
        orderBy: { createdAt: 'desc' },
        take,
        include: {
          tenant: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
        },
      }),
    ]);

    return [
      ...subscriptionRows.map((row) => this.toControlCenterPaymentRow(row)),
      ...smsPurchaseRows.map((row) => this.toControlCenterSmsPaymentRow(row)),
    ]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, take);
  }

  private controlCenterPaymentStats(
    payments: Array<{
      kind: 'subscription' | 'sms';
      status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'REVERSED';
      amount: number;
    }>,
  ) {
    const completed = payments.filter((row) => row.status === 'COMPLETED');
    const failed = payments.filter((row) =>
      ['FAILED', 'CANCELLED', 'REVERSED'].includes(row.status),
    );

    return {
      total: payments.length,
      pending: payments.filter((row) => row.status === 'PENDING').length,
      pendingSubscriptions: payments.filter(
        (row) => row.kind === 'subscription' && row.status === 'PENDING',
      ).length,
      pendingSms: payments.filter(
        (row) => row.kind === 'sms' && row.status === 'PENDING',
      ).length,
      completed: completed.length,
      failed: failed.length,
      completedRevenue: completed.reduce((sum, row) => sum + row.amount, 0),
      completedPayments: completed.length,
      completedSubscriptionRevenue: completed
        .filter((row) => row.kind === 'subscription')
        .reduce((sum, row) => sum + row.amount, 0),
      completedSmsRevenue: completed
        .filter((row) => row.kind === 'sms')
        .reduce((sum, row) => sum + row.amount, 0),
    };
  }

  private toControlCenterPaymentRow(row: {
    id: string;
    tenantId: string;
    branchId: string;
    planId: string;
    merchantReference: string;
    orderTrackingId: string | null;
    amount: Prisma.Decimal | number;
    currency: string;
    status: SubscriptionPaymentStatus;
    rawPayload: Prisma.JsonValue | null;
    paidAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    tenant: { id?: string; name: string };
    branch: { id?: string; name: string };
    plan: { code: string; name?: string; interval?: string };
  }) {
    const verifiedAt =
      this.payloadString(row.rawPayload, ['verified_at', 'verifiedAt']) ??
      (row.status === SubscriptionPaymentStatus.COMPLETED
        ? (row.paidAt ?? row.updatedAt).toISOString()
        : null);
    const failedAt = this.payloadString(row.rawPayload, [
      'failed_at',
      'failedAt',
    ]);

    return {
      id: row.id,
      kind: 'subscription' as const,
      tenantId: row.tenantId,
      branchId: row.branchId,
      planId: row.planId,
      organizationName: row.tenant.name,
      branchName: row.branch.name,
      planCode: row.plan.code,
      planName: row.plan.name ?? row.plan.code,
      interval: row.plan.interval ?? null,
      smsUnits: null,
      bundleId: null,
      amount: this.decimal(row.amount),
      expectedAmount: this.decimal(row.amount),
      currency: row.currency,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      paidAt: row.paidAt?.toISOString() ?? null,
      paymentMethod: this.paymentMethodFromPayload(row.rawPayload),
      merchantReference: row.merchantReference,
      merchantCode: this.payloadString(row.rawPayload, ['merchant_code']),
      accountName: this.payloadString(row.rawPayload, ['account_name']),
      transactionId:
        this.payloadString(row.rawPayload, [
          'transaction_id',
          'transactionId',
          'TransactionId',
        ]) ?? row.orderTrackingId,
      verificationCode: this.payloadString(row.rawPayload, [
        'merchant_confirmed_transaction_id',
        'verification_code',
        'verificationCode',
      ]),
      verifiedBy:
        row.status === SubscriptionPaymentStatus.COMPLETED
          ? this.payloadString(row.rawPayload, [
              'verified_by_name',
              'verifiedByName',
              'verified_by',
              'verifiedBy',
            ])
          : null,
      verifiedAt,
      failureReason:
        row.status === SubscriptionPaymentStatus.FAILED
          ? this.payloadString(row.rawPayload, [
              'failure_reason',
              'failureReason',
              'reason',
            ])
          : null,
      failedAt,
      canReview:
        row.status === SubscriptionPaymentStatus.PENDING &&
        this.isManualMerchantPayload(row.rawPayload),
    };
  }

  private toControlCenterSmsPaymentRow(row: {
    id: string;
    tenantId: string;
    branchId: string;
    bundleId: string;
    bundleNameSnapshot: string;
    amountExpected: number;
    currency: string;
    smsUnitsExpected: number;
    merchantReference: string;
    pesapalOrderTrackingId: string | null;
    externalTransactionId: string | null;
    status: SmsPurchaseStatus;
    rawPayload: Prisma.JsonValue | null;
    creditedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    tenant: { id?: string; name: string };
    branch: { id?: string; name: string };
  }) {
    const status = this.smsPurchasePaymentStatus(row.status);
    const verifiedAt =
      this.payloadString(row.rawPayload, ['verified_at', 'verifiedAt']) ??
      (status === 'COMPLETED'
        ? (row.creditedAt ?? row.updatedAt).toISOString()
        : null);
    const failedAt = this.payloadString(row.rawPayload, [
      'failed_at',
      'failedAt',
    ]);

    return {
      id: row.id,
      kind: 'sms' as const,
      tenantId: row.tenantId,
      branchId: row.branchId,
      planId: null,
      organizationName: row.tenant.name,
      branchName: row.branch.name,
      planCode: null,
      planName: row.bundleNameSnapshot,
      interval: null,
      smsUnits: row.smsUnitsExpected,
      bundleId: row.bundleId,
      amount: row.amountExpected,
      expectedAmount: row.amountExpected,
      currency: row.currency,
      status,
      createdAt: row.createdAt.toISOString(),
      paidAt: row.creditedAt?.toISOString() ?? null,
      paymentMethod: this.paymentMethodFromPayload(row.rawPayload),
      merchantReference: row.merchantReference,
      merchantCode: this.payloadString(row.rawPayload, ['merchant_code']),
      accountName: this.payloadString(row.rawPayload, ['account_name']),
      transactionId:
        this.payloadString(row.rawPayload, [
          'transaction_id',
          'transactionId',
          'TransactionId',
        ]) ??
        row.externalTransactionId ??
        row.pesapalOrderTrackingId,
      verificationCode: this.payloadString(row.rawPayload, [
        'merchant_confirmed_transaction_id',
        'verification_code',
        'verificationCode',
      ]),
      verifiedBy:
        status === 'COMPLETED'
          ? this.payloadString(row.rawPayload, [
              'verified_by_name',
              'verifiedByName',
              'verified_by',
              'verifiedBy',
            ])
          : null,
      verifiedAt,
      failureReason:
        status === 'FAILED' || status === 'CANCELLED' || status === 'REVERSED'
          ? this.payloadString(row.rawPayload, [
              'failure_reason',
              'failureReason',
              'reason',
            ])
          : null,
      failedAt,
      canReview:
        status === 'PENDING' && this.isManualMerchantPayload(row.rawPayload),
    };
  }

  private smsPurchasePaymentStatus(
    status: SmsPurchaseStatus,
  ): 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'REVERSED' {
    if (status === SmsPurchaseStatus.CREDITED) {
      return 'COMPLETED';
    }

    if (status === SmsPurchaseStatus.CANCELLED_BY_USER) {
      return 'CANCELLED';
    }

    if (
      status === SmsPurchaseStatus.REFUNDED ||
      status === SmsPurchaseStatus.REVERSED
    ) {
      return 'REVERSED';
    }

    if (
      status === SmsPurchaseStatus.PAYMENT_FAILED ||
      status === SmsPurchaseStatus.PAYMENT_MISMATCH ||
      status === SmsPurchaseStatus.EXPIRED
    ) {
      return 'FAILED';
    }

    return 'PENDING';
  }

  private paymentMethodFromPayload(raw: Prisma.JsonValue | null) {
    const provider = this.payloadString(raw, ['provider']);
    const method = this.payloadString(raw, [
      'payment_method',
      'paymentMethod',
      'payment_method_type',
    ]);
    const value = `${provider ?? ''} ${method ?? ''}`.toLowerCase();
    if (value.includes('mtn')) {
      return 'MTN';
    }
    if (value.includes('airtel')) {
      return 'AIRTEL';
    }
    if (method || provider) {
      return 'OTHER';
    }
    return 'UNKNOWN';
  }

  private isManualMerchantPayload(raw: Prisma.JsonValue | null) {
    return this.payloadObject(raw)?.manualMerchant === true;
  }

  private payloadString(raw: Prisma.JsonValue | null, keys: string[]) {
    const payload = this.payloadObject(raw);
    if (!payload) {
      return null;
    }
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
      }
    }
    return null;
  }

  private payloadObject(raw: Prisma.JsonValue | null) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return null;
    }
    return raw as Record<string, unknown>;
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
    const now = Date.now();
    const overrideStatus = override
      ? override.effectiveFrom.getTime() > now
        ? 'SCHEDULED'
        : override.effectiveUntil && override.effectiveUntil.getTime() < now
          ? 'EXPIRED'
          : 'ACTIVE'
      : null;
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
            status: overrideStatus,
          }
        : null,
    };
  }

  private controlCenterAuditCategory(action: string) {
    if (
      action.startsWith('control_center.user.') ||
      action.startsWith('control_center.feature.') ||
      action === 'control_center.admin.setup'
    ) {
      return 'SECURITY';
    }

    if (
      action === 'control_center.message.sent' ||
      action === 'control_center.pricing.notification_sent' ||
      action === 'control_center.pricing.notification_failed' ||
      action.startsWith('control_center.marketing.')
    ) {
      return 'COMMUNICATIONS';
    }

    if (action.startsWith('control_center.pricing.')) {
      return 'COMMERCIAL';
    }

    return 'GENERAL';
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

  private latestDate(values: Date[]) {
    let latest: Date | null = null;
    for (const value of values) {
      if (!latest || value.getTime() > latest.getTime()) {
        latest = value;
      }
    }
    return latest;
  }
}
