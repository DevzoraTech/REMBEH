import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  BranchSubscriptionStatus,
  Prisma,
  SmsBundleStatus,
  SmsPurchaseStatus,
  SubscriptionPaymentStatus,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { Webhook } from 'svix';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { resolveWebAppBaseUrl } from '../../common/config/web-app-url';
import { isPrismaUniqueConstraintError } from '../../common/database/prisma-errors';
import { PrismaService } from '../../database/prisma.service';
import {
  BillingCheckoutResponseContract,
  BillingPlanContract,
  BillingSummaryContract,
  BranchBillingStatusContract,
  ManualMerchantPaymentResponseContract,
  SubscriptionPaymentRowContract,
} from './billing.contracts';
import {
  BILLING_PERMISSIONS,
  GRACE_DAYS,
  PRO_MONTHLY_AMOUNT_UGX,
  PRO_PLAN_CATALOGUE,
  PRO_PLAN_CODE,
  TRIAL_DAYS,
  defaultProPlanCode,
  monthsForInterval,
  proPlanByCode,
} from './billing.permissions';
import { PesapalClient } from './pesapal.client';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';
import { SmsService } from '../notifications/sms.service';
import { FcmPushService } from '../notifications/fcm-push.service';
import { SmsCreditsService } from '../sms-credits/sms-credits.service';
import { REALTIME_EVENTS } from '../realtime/realtime.events';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  ManualMerchantPaymentProvider,
  SubmitManualMerchantPaymentDto,
} from './dto/submit-manual-merchant-payment.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
const BILLING_REMINDER_COOLDOWN_MS = 20 * 60 * 60 * 1000;
const SUBSCRIPTION_EXPIRY_REMINDER_DAYS = new Set([7, 2]);

const SUBSCRIPTION_PAYMENT_BRANCH_SELECT = {
  name: true,
  subscription: {
    select: {
      status: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
    },
  },
} satisfies Prisma.BranchSelect;

const SUBSCRIPTION_PAYMENT_ROW_INCLUDE = {
  branch: { select: SUBSCRIPTION_PAYMENT_BRANCH_SELECT },
  plan: { select: { interval: true, code: true } },
} satisfies Prisma.SubscriptionPaymentInclude;

const SUBSCRIPTION_PAYMENT_TENANT_INCLUDE = {
  ...SUBSCRIPTION_PAYMENT_ROW_INCLUDE,
  tenant: { select: { name: true } },
} satisfies Prisma.SubscriptionPaymentInclude;

type SubscriptionPaymentWithBranchPlan = Prisma.SubscriptionPaymentGetPayload<{
  include: typeof SUBSCRIPTION_PAYMENT_ROW_INCLUDE;
}>;

type SubscriptionPaymentWithBranchPlanTenant =
  Prisma.SubscriptionPaymentGetPayload<{
    include: typeof SUBSCRIPTION_PAYMENT_TENANT_INCLUDE;
  }>;

type SmsPurchaseWithBranch = Prisma.SmsPurchaseGetPayload<{
  include: {
    branch: { select: { name: true } };
  };
}>;

type SmsPurchaseWithBranchTenant = Prisma.SmsPurchaseGetPayload<{
  include: {
    branch: { select: { name: true } };
    tenant: { select: { name: true } };
  };
}>;

type ManualPaymentSummaryItem = {
  organizationName: string;
  branchName: string;
  planLabel: string;
  amountLabel: string;
  paymentMethod: string;
  merchantCode: string;
  transactionId: string;
};

type ManualPendingPayment =
  | {
      kind: 'subscription';
      id: string;
      payment: SubscriptionPaymentWithBranchPlanTenant;
    }
  | {
      kind: 'sms';
      id: string;
      purchase: SmsPurchaseWithBranchTenant;
    };

type ResendWebhookEvent = {
  type?: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string[];
    received_for?: string[];
    subject?: string;
  };
};

type ResendWebhookHeaders = {
  id?: string | string[];
  timestamp?: string | string[];
  signature?: string | string[];
};

type SubscriptionOwnerReminderKind =
  'trial_ending' | 'expires_soon' | 'grace' | 'locked';

type PaymentReplyCommand =
  | { action: 'confirm'; transactionIds: string[] }
  | { action: 'fail'; reason: string };

const DEFAULT_PAYMENT_VERIFICATION_EMAILS = [
  'antikra.ug@gmail.com',
  'bonnefilleul@gmail.com',
  'services@antikra.com',
];

function latestDate(values: Date[]) {
  let latest: Date | null = null;
  for (const value of values) {
    if (!latest || value.getTime() > latest.getTime()) {
      latest = value;
    }
  }
  return latest;
}

@Injectable()
export class BillingService implements OnModuleInit {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pesapal: PesapalClient,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly smsService: SmsService,
    private readonly fcmPushService: FcmPushService,
    private readonly realtime: RealtimeGateway,
    @Inject(forwardRef(() => SmsCreditsService))
    private readonly smsCreditsService: SmsCreditsService,
  ) {}

  async onModuleInit() {
    try {
      await this.ensureProPlans();
      await this.backfillOwnerBillingPermission();
    } catch (error) {
      this.logger.warn(
        `Billing bootstrap skipped: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /** Grant billing.manage to Account Owner on every tenant (existing orgs). */
  async backfillOwnerBillingPermission() {
    const tenants = await this.prisma.tenant.findMany({ select: { id: true } });
    for (const tenant of tenants) {
      const permission = await this.prisma.permission.upsert({
        where: {
          tenantId_key: {
            tenantId: tenant.id,
            key: BILLING_PERMISSIONS.manage,
          },
        },
        create: {
          tenantId: tenant.id,
          key: BILLING_PERMISSIONS.manage,
          moduleKey: 'workspace',
          description: 'Account: billing.manage',
        },
        update: {},
      });

      const ownerRole = await this.prisma.role.findFirst({
        where: { tenantId: tenant.id, name: 'Account Owner' },
        select: { id: true },
      });
      if (!ownerRole) continue;

      await this.prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: ownerRole.id,
            permissionId: permission.id,
          },
        },
        create: {
          roleId: ownerRole.id,
          permissionId: permission.id,
        },
        update: {},
      });
    }
  }

  async getMyBranchStatus(
    user: AuthenticatedUser,
  ): Promise<BranchBillingStatusContract> {
    const dbPlans = await this.ensureProPlans();
    const monthlyPlan =
      dbPlans.find((plan) => plan.code === PRO_PLAN_CODE) ?? dbPlans[0];
    let planAmount = PRO_MONTHLY_AMOUNT_UGX;
    let planCurrency = 'UGX';

    if (!user.branchId) {
      return {
        branchId: null,
        branchName: null,
        status: null,
        locked: false,
        graceEndsAt: null,
        currentPeriodEnd: null,
        daysUntilGraceEnd: null,
        daysUntilPeriodEnd: null,
        trialDaysRemaining: null,
        trialEndsAt: null,
        planAmount,
        planCurrency,
        message: null,
      };
    }

    await this.ensureTenantBilling(user.tenantId);
    if (monthlyPlan) {
      const effectivePrice = await this.resolveEffectivePlanPrice(
        user.tenantId,
        user.branchId,
        monthlyPlan,
      );
      planAmount = Number(effectivePrice.amount);
      planCurrency = effectivePrice.currency;
    }
    await this.syncTenantSubscriptions(user.tenantId);
    let sub = await this.prisma.branchSubscription.findUnique({
      where: { branchId: user.branchId },
      include: { branch: { select: { name: true } } },
    });
    if (!sub) {
      await this.provisionBranchSubscription({
        tenantId: user.tenantId,
        branchId: user.branchId,
      });
      sub = await this.prisma.branchSubscription.findUnique({
        where: { branchId: user.branchId },
        include: { branch: { select: { name: true } } },
      });
    }

    const now = Date.now();
    const locked = sub?.status === BranchSubscriptionStatus.LOCKED;
    const trialPeriodEnd =
      sub?.status === BranchSubscriptionStatus.TRIAL
        ? (sub.currentPeriodEnd ?? null)
        : null;
    const trialActive = Boolean(
      trialPeriodEnd && trialPeriodEnd.getTime() > now,
    );
    const trialDaysRemaining = trialActive
      ? Math.max(
          0,
          Math.ceil((trialPeriodEnd!.getTime() - now) / (24 * 60 * 60 * 1000)),
        )
      : null;

    return {
      branchId: user.branchId,
      branchName: sub?.branch.name ?? null,
      status: sub?.status ?? null,
      locked: Boolean(locked),
      graceEndsAt: sub?.graceEndsAt?.toISOString() ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
      daysUntilGraceEnd: sub?.graceEndsAt
        ? Math.max(
            0,
            Math.ceil(
              (sub.graceEndsAt.getTime() - now) / (24 * 60 * 60 * 1000),
            ),
          )
        : null,
      daysUntilPeriodEnd: sub?.currentPeriodEnd
        ? Math.ceil(
            (sub.currentPeriodEnd.getTime() - now) / (24 * 60 * 60 * 1000),
          )
        : null,
      trialDaysRemaining,
      trialEndsAt: trialPeriodEnd?.toISOString() ?? null,
      planAmount,
      planCurrency,
      message: locked
        ? 'This branch is paused. Renew on Subscription to continue.'
        : sub?.status === BranchSubscriptionStatus.GRACE
          ? 'Your subscription has expired. Renew now to keep this branch open.'
          : null,
    };
  }

  async listPayments(
    user: AuthenticatedUser,
  ): Promise<{ payments: SubscriptionPaymentRowContract[] }> {
    const canManageAll = user.permissions.includes(BILLING_PERMISSIONS.manage);
    if (!canManageAll && !user.branchId) {
      throw new ForbiddenException(
        'You can only view payments for your branch.',
      );
    }

    const where = canManageAll
      ? { tenantId: user.tenantId }
      : { tenantId: user.tenantId, branchId: user.branchId! };

    const [subscriptionRows, smsPurchaseRows, smsLegacyRows] =
      await Promise.all([
        this.prisma.subscriptionPayment.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: 100,
          include: SUBSCRIPTION_PAYMENT_ROW_INCLUDE,
        }),
        this.prisma.smsPurchase.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: 100,
          include: {
            branch: { select: { name: true } },
          },
        }),
        this.prisma.smsCreditPayment.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: 100,
          include: {
            branch: { select: { name: true } },
          },
        }),
      ]);

    const latestPaidSubscriptionByBranch = new Map<
      string,
      { id: string; date: Date }
    >();
    for (const row of subscriptionRows) {
      if (row.status !== SubscriptionPaymentStatus.COMPLETED) continue;
      const rowDate = row.paidAt ?? row.updatedAt ?? row.createdAt;
      const existing = latestPaidSubscriptionByBranch.get(row.branchId);
      if (!existing || rowDate.getTime() > existing.date.getTime()) {
        latestPaidSubscriptionByBranch.set(row.branchId, {
          id: row.id,
          date: rowDate,
        });
      }
    }

    const subscriptionPayments: SubscriptionPaymentRowContract[] =
      subscriptionRows.map((row) => {
        const priorPaid = subscriptionRows.some(
          (other) =>
            other.branchId === row.branchId &&
            other.id !== row.id &&
            other.status === SubscriptionPaymentStatus.COMPLETED &&
            other.createdAt < row.createdAt,
        );
        return this.toSubscriptionPaymentRow(row, {
          priorPaid,
          useBranchSubscriptionPeriod:
            latestPaidSubscriptionByBranch.get(row.branchId)?.id === row.id,
        });
      });

    const smsPurchasePayments: SubscriptionPaymentRowContract[] =
      smsPurchaseRows.map((row) => this.toSmsPurchasePaymentRow(row));

    const smsLegacyPayments: SubscriptionPaymentRowContract[] =
      smsLegacyRows.map((row) => {
        const paid = row.status === SubscriptionPaymentStatus.COMPLETED;
        const failed = row.status === SubscriptionPaymentStatus.FAILED;
        const isWelcome = row.merchantReference.startsWith('pro_welcome_');
        return {
          id: row.id,
          date: (row.paidAt ?? row.createdAt).toISOString(),
          branchId: row.branchId,
          branchName: row.branch.name,
          kind: 'sms' as const,
          transaction: isWelcome
            ? 'Pro plan welcome SMS credits'
            : 'SMS top-up',
          periodLabel: `${row.credits.toLocaleString('en-UG')} SMS`,
          amount: Number(row.amount),
          currency: row.currency,
          credits: row.credits,
          paymentMethod: isWelcome
            ? 'Included with Pro'
            : this.paymentMethodFromPayload(row.rawPayload),
          status: paid ? 'Paid' : failed ? 'Failed' : 'Pending',
          receipt: paid
            ? `#${row.merchantReference.slice(-8).toUpperCase()}`
            : null,
          canRetry: false,
        };
      });

    const payments = [
      ...subscriptionPayments,
      ...smsPurchasePayments,
      ...smsLegacyPayments,
    ].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

    return { payments: payments.slice(0, 100) };
  }

  async ensureTenantBilling(tenantId: string) {
    const existing = await this.prisma.tenantBilling.findUnique({
      where: { tenantId },
    });
    if (existing) return existing;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, createdAt: true },
    });
    if (!tenant) {
      throw new NotFoundException('Organisation not found.');
    }

    const trialStartsAt = tenant.createdAt;
    const trialEndsAt = new Date(
      trialStartsAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000,
    );

    return this.prisma.tenantBilling.create({
      data: {
        tenantId,
        trialStartsAt,
        trialEndsAt,
      },
    });
  }

  async ensureProPlans() {
    const plans = [];
    for (const definition of PRO_PLAN_CATALOGUE) {
      const existing = await this.prisma.subscriptionPlan.findUnique({
        where: { code: definition.code },
      });
      if (existing) {
        const amount = Number(existing.amount);
        if (
          amount !== definition.amountUgx ||
          existing.interval !== definition.interval ||
          !existing.isActive ||
          existing.name !== definition.name
        ) {
          plans.push(
            await this.prisma.subscriptionPlan.update({
              where: { id: existing.id },
              data: {
                amount: new Prisma.Decimal(definition.amountUgx),
                currency: 'UGX',
                interval: definition.interval,
                isActive: true,
                name: definition.name,
              },
            }),
          );
          continue;
        }
        plans.push(existing);
        continue;
      }

      plans.push(
        await this.prisma.subscriptionPlan.create({
          data: {
            code: definition.code,
            name: definition.name,
            amount: new Prisma.Decimal(definition.amountUgx),
            currency: 'UGX',
            interval: definition.interval,
            isActive: true,
          },
        }),
      );
    }
    return plans;
  }

  /** @deprecated Prefer ensureProPlans / resolvePlanByCode. */
  async ensureProPlan() {
    const plans = await this.ensureProPlans();
    return plans.find((plan) => plan.code === PRO_PLAN_CODE) ?? plans[0];
  }

  async resolvePlanByCode(planCode?: string | null) {
    await this.ensureProPlans();
    const code = (planCode?.trim() || defaultProPlanCode()).toUpperCase();
    const definition = proPlanByCode(code);
    if (!definition) {
      throw new BadRequestException('Choose a valid billing period.');
    }
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { code: definition.code },
    });
    if (!plan || !plan.isActive) {
      throw new BadRequestException('Choose a valid billing period.');
    }
    return { plan, definition };
  }

  private toPlanContract(
    definition: (typeof PRO_PLAN_CATALOGUE)[number],
    price?: {
      amount: Prisma.Decimal | number;
      currency: string;
      source?: 'DEFAULT_PLAN' | 'ORGANIZATION_OVERRIDE' | 'BRANCH_OVERRIDE';
      overrideId?: string | null;
    },
  ): BillingPlanContract {
    const amount = Number(price?.amount ?? definition.amountUgx);
    const savings =
      definition.compareAtUgx != null
        ? Math.max(0, definition.compareAtUgx - amount)
        : null;
    return {
      code: definition.code,
      name: definition.name,
      amount,
      currency: price?.currency ?? 'UGX',
      interval: definition.interval,
      durationMonths: definition.durationMonths,
      label: definition.label,
      tagline: definition.tagline,
      compareAtAmount: definition.compareAtUgx,
      savingsAmount: savings && savings > 0 ? savings : null,
      badge: definition.badge,
      defaultSelected: definition.defaultSelected,
      standardAmount: definition.amountUgx,
      pricingSource: price?.source ?? 'DEFAULT_PLAN',
      priceOverrideId: price?.overrideId ?? null,
    };
  }

  async provisionBranchSubscription(input: {
    tenantId: string;
    branchId: string;
  }) {
    await this.ensureTenantBilling(input.tenantId);
    const plan = await this.ensureProPlan();
    const existing = await this.prisma.branchSubscription.findUnique({
      where: { branchId: input.branchId },
    });
    if (existing) return existing;

    const branch = await this.prisma.branch.findFirst({
      where: { id: input.branchId, tenantId: input.tenantId },
      select: { createdAt: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found.');
    }

    const trial = this.branchTrialWindow(branch);
    const now = new Date();
    const inTrial = trial.endsAt.getTime() > now.getTime();

    if (inTrial) {
      return this.prisma.branchSubscription.create({
        data: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          planId: plan.id,
          status: BranchSubscriptionStatus.TRIAL,
          currentPeriodStart: trial.startsAt,
          currentPeriodEnd: trial.endsAt,
        },
      });
    }

    const graceEndsAt = new Date(
      now.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000,
    );
    return this.prisma.branchSubscription.create({
      data: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        planId: plan.id,
        status: BranchSubscriptionStatus.GRACE,
        currentPeriodStart: now,
        currentPeriodEnd: now,
        graceEndsAt,
      },
    });
  }

  async getSummary(user: AuthenticatedUser): Promise<BillingSummaryContract> {
    const canManageAll = user.permissions.includes(BILLING_PERMISSIONS.manage);
    if (!canManageAll && !user.branchId) {
      throw new ForbiddenException(
        'You can only view the plan for your branch.',
      );
    }

    const billing = await this.ensureTenantBilling(user.tenantId);
    const dbPlans = await this.ensureProPlans();
    const plansByCode = new Map(dbPlans.map((row) => [row.code, row]));
    const defaultPlans = PRO_PLAN_CATALOGUE.map((definition) =>
      this.toPlanContract(definition),
    );
    await this.syncTenantSubscriptions(user.tenantId);

    const branchWhere = canManageAll
      ? { tenantId: user.tenantId }
      : { tenantId: user.tenantId, id: user.branchId! };

    const branches = await this.prisma.branch.findMany({
      where: branchWhere,
      orderBy: { name: 'asc' },
      include: { subscription: true },
    });

    for (const branch of branches) {
      if (!branch.subscription) {
        await this.provisionBranchSubscription({
          tenantId: user.tenantId,
          branchId: branch.id,
        });
      }
    }

    const refreshed = await this.prisma.branch.findMany({
      where: branchWhere,
      orderBy: { name: 'asc' },
      include: {
        subscription: true,
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
    });

    const now = Date.now();
    const reminders: string[] = [];
    const rows = await Promise.all(
      refreshed.map(async (branch) => {
        const sub = branch.subscription!;
        const reminder = this.reminderFor(sub, branch.name);
        if (reminder) reminders.push(reminder);
        const branchPlans = await Promise.all(
          PRO_PLAN_CATALOGUE.map(async (definition) => {
            const planRecord = plansByCode.get(definition.code);
            if (!planRecord) return this.toPlanContract(definition);
            const effectivePrice = await this.resolveEffectivePlanPrice(
              user.tenantId,
              branch.id,
              planRecord,
            );
            return this.toPlanContract(definition, effectivePrice);
          }),
        );
        const lastUsedAt = latestDate(
          branch.users.flatMap((branchUser) =>
            branchUser.authSessions.map((session) => session.lastSeenAt),
          ),
        );
        return {
          branchId: branch.id,
          branchName: branch.name,
          status: sub.status,
          currentPeriodStart: sub.currentPeriodStart?.toISOString() ?? null,
          currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
          graceEndsAt: sub.graceEndsAt?.toISOString() ?? null,
          lockedAt: sub.lockedAt?.toISOString() ?? null,
          daysUntilPeriodEnd: sub.currentPeriodEnd
            ? Math.ceil(
                (sub.currentPeriodEnd.getTime() - now) / (24 * 60 * 60 * 1000),
              )
            : null,
          daysUntilGraceEnd: sub.graceEndsAt
            ? Math.ceil(
                (sub.graceEndsAt.getTime() - now) / (24 * 60 * 60 * 1000),
              )
            : null,
          canCheckout: false,
          reminder,
          plans: branchPlans,
          lastUsedAt: lastUsedAt?.toISOString() ?? null,
        };
      }),
    );

    for (const row of rows) {
      if (
        row.status === BranchSubscriptionStatus.GRACE ||
        row.status === BranchSubscriptionStatus.LOCKED ||
        row.status === BranchSubscriptionStatus.PAST_DUE ||
        row.status === BranchSubscriptionStatus.ACTIVE ||
        row.status === BranchSubscriptionStatus.TRIAL
      ) {
        row.canCheckout = true;
      }
    }

    const plans = canManageAll
      ? defaultPlans
      : (rows[0]?.plans ?? defaultPlans);
    const plan = plans.find((row) => row.code === PRO_PLAN_CODE) ?? plans[0];
    const branchTrial =
      !canManageAll &&
      rows[0]?.status === BranchSubscriptionStatus.TRIAL &&
      rows[0].currentPeriodStart &&
      rows[0].currentPeriodEnd
        ? {
            startsAt: new Date(rows[0].currentPeriodStart),
            endsAt: new Date(rows[0].currentPeriodEnd),
          }
        : null;
    const trialStart = branchTrial?.startsAt ?? billing.trialStartsAt;
    const trialEnd = branchTrial?.endsAt ?? billing.trialEndsAt;
    const trialActive = trialEnd.getTime() > now;
    const daysRemaining = Math.max(
      0,
      Math.ceil((trialEnd.getTime() - now) / (24 * 60 * 60 * 1000)),
    );

    return {
      plan,
      plans,
      trial: {
        active: trialActive,
        startsAt: trialStart.toISOString(),
        endsAt: trialEnd.toISOString(),
        daysRemaining,
      },
      scope: canManageAll ? 'organisation' : 'branch',
      canPay: true,
      branches: rows,
      reminders,
    };
  }

  async startCheckout(
    user: AuthenticatedUser,
    branchId: string,
    planCode?: string,
  ): Promise<BillingCheckoutResponseContract> {
    const canManageAll = user.permissions.includes(BILLING_PERMISSIONS.manage);
    if (!canManageAll && user.branchId !== branchId) {
      throw new ForbiddenException('You can only pay for your own branch.');
    }
    if (!canManageAll && !user.branchId) {
      throw new ForbiddenException('You can only pay for your own branch.');
    }

    if (!this.pesapal.isConfigured()) {
      throw new ServiceUnavailableException(
        'Payments are unavailable right now. Please try again later.',
      );
    }

    await this.ensureTenantBilling(user.tenantId);
    const { plan, definition } = await this.resolvePlanByCode(planCode);
    await this.syncTenantSubscriptions(user.tenantId);

    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenantId: user.tenantId },
      include: { subscription: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found.');
    }

    if (!branch.subscription) {
      await this.provisionBranchSubscription({
        tenantId: user.tenantId,
        branchId: branch.id,
      });
    }

    const payer = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { email: true, phone: true, displayName: true },
    });

    const merchantReference = `sub_${branch.id.slice(0, 8)}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const apiCallback =
      this.configService.get<string>('PESAPAL_CALLBACK_URL')?.trim() ||
      `${this.configService.get<string>('API_PUBLIC_URL')?.trim() || ''}/api/v1/billing/pesapal/callback`;

    if (!apiCallback) {
      throw new ServiceUnavailableException(
        'Payments are unavailable right now. Please try again later.',
      );
    }

    const effectivePrice = await this.resolveEffectivePlanPrice(
      user.tenantId,
      branch.id,
      plan,
    );

    const payment = await this.prisma.subscriptionPayment.create({
      data: {
        tenantId: user.tenantId,
        branchId: branch.id,
        planId: plan.id,
        merchantReference,
        amount: effectivePrice.amount,
        currency: effectivePrice.currency,
        status: SubscriptionPaymentStatus.PENDING,
      },
    });

    const nameParts = (
      payer?.displayName ||
      user.displayName ||
      'REMBEH'
    ).split(/\s+/);

    const webAppUrl = resolveWebAppBaseUrl(this.configService);

    let order;
    try {
      order = await this.pesapal.submitOrder({
        id: merchantReference,
        currency: effectivePrice.currency,
        amount: Number(effectivePrice.amount),
        description: `REMBEH Pro ${definition.label} — ${branch.name}`.slice(
          0,
          100,
        ),
        callbackUrl: apiCallback,
        cancellationUrl: `${webAppUrl}/subscription`,
        branchName: branch.name,
        billingAddress: {
          email_address: payer?.email || user.email,
          phone_number: payer?.phone,
          country_code: 'UG',
          first_name: nameParts[0] || 'REMBEH',
          last_name: nameParts.slice(1).join(' ') || 'User',
        },
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Payment could not be started.';
      this.logger.error(`Checkout provider failed: ${message}`);
      await this.prisma.subscriptionPayment.update({
        where: { id: payment.id },
        data: { status: SubscriptionPaymentStatus.FAILED },
      });
      throw this.toCheckoutHttpException(message);
    }

    if (!order.redirect_url) {
      await this.prisma.subscriptionPayment.update({
        where: { id: payment.id },
        data: { status: SubscriptionPaymentStatus.FAILED },
      });
      throw new ServiceUnavailableException(
        'Payments are unavailable right now. Please try again later.',
      );
    }

    await this.prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: {
        orderTrackingId: order.order_tracking_id ?? null,
        rawPayload: order,
      },
    });

    return {
      redirectUrl: order.redirect_url,
      merchantReference,
      orderTrackingId: order.order_tracking_id ?? null,
    };
  }

  async submitManualMerchantPayment(
    user: AuthenticatedUser,
    branchId: string,
    dto: SubmitManualMerchantPaymentDto,
  ): Promise<ManualMerchantPaymentResponseContract> {
    const canManageAll = user.permissions.includes(BILLING_PERMISSIONS.manage);
    if (!canManageAll && user.branchId !== branchId) {
      throw new ForbiddenException('You can only pay for your own branch.');
    }
    if (!canManageAll && !user.branchId) {
      throw new ForbiddenException('You can only pay for your own branch.');
    }

    const providerDetails = this.manualMerchantDetails(dto.provider);
    const transactionId = this.normalizeManualTransactionId(
      dto.transactionId ?? '',
    );
    if (!transactionId) {
      throw new BadRequestException('Enter the payment transaction ID.');
    }
    const confirmationId = this.normalizeManualTransactionId(
      dto.confirmTransactionId ?? '',
    );
    if (!confirmationId) {
      throw new BadRequestException(
        'Confirm the transaction ID by entering it again.',
      );
    }
    if (
      this.compactTransactionId(transactionId) !==
      this.compactTransactionId(confirmationId)
    ) {
      throw new BadRequestException(
        'The transaction IDs do not match. Check both entries and try again.',
      );
    }

    await this.ensureTenantBilling(user.tenantId);
    const { plan, definition } = await this.resolvePlanByCode(dto.planCode);
    await this.syncTenantSubscriptions(user.tenantId);

    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenantId: user.tenantId },
      include: { subscription: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found.');
    }

    if (!branch.subscription) {
      await this.provisionBranchSubscription({
        tenantId: user.tenantId,
        branchId: branch.id,
      });
    }

    const merchantReference = this.manualMerchantReference(
      dto.provider,
      transactionId,
    );
    const existing = await this.prisma.subscriptionPayment.findUnique({
      where: { merchantReference },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'This transaction ID has already been submitted.',
      );
    }

    const pendingRequest = await this.prisma.subscriptionPayment.findFirst({
      where: {
        tenantId: user.tenantId,
        branchId: branch.id,
        planId: plan.id,
        status: SubscriptionPaymentStatus.PENDING,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (
      pendingRequest &&
      this.isManualMerchantPayload(pendingRequest.rawPayload)
    ) {
      throw new ConflictException(
        'A payment request for this purchase is already pending. Cancel it before submitting another transaction ID.',
      );
    }

    const rawPayload = {
      manualMerchant: true,
      provider: dto.provider,
      payment_method: providerDetails.historyLabel,
      transaction_id: transactionId,
      merchant_code: providerDetails.merchantCode,
      account_name: providerDetails.accountName,
      plan_code: definition.code,
      submitted_by_user_id: user.userId,
      submitted_at: new Date().toISOString(),
    } satisfies Prisma.InputJsonObject;

    try {
      const effectivePrice = await this.resolveEffectivePlanPrice(
        user.tenantId,
        branch.id,
        plan,
      );

      const payment = await this.prisma.subscriptionPayment.create({
        data: {
          tenantId: user.tenantId,
          branchId: branch.id,
          planId: plan.id,
          merchantReference,
          amount: effectivePrice.amount,
          currency: effectivePrice.currency,
          status: SubscriptionPaymentStatus.PENDING,
          rawPayload: {
            ...rawPayload,
            price_source: effectivePrice.source,
            price_override_id: effectivePrice.overrideId,
          },
        },
        include: SUBSCRIPTION_PAYMENT_ROW_INCLUDE,
      });

      const alertedPayment = await this.sendManualPaymentVerificationAlert(
        payment,
        {
          transactionId,
          paymentMethod: providerDetails.historyLabel,
          merchantCode: providerDetails.merchantCode,
          submittedByName: user.displayName || user.email || 'REMBEH user',
          submittedByEmail: user.email ?? null,
        },
      );
      const responsePayment = alertedPayment ?? payment;
      this.emitSubscriptionPaymentUpdate(responsePayment);

      return {
        payment: this.toSubscriptionPaymentRow(responsePayment),
        message:
          'Payment submitted for verification. We will activate your subscription after confirmation.',
      };
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        throw new ConflictException(
          'This transaction ID has already been submitted.',
        );
      }
      throw error;
    }
  }

  async submitManualSmsMerchantPayment(
    user: AuthenticatedUser,
    branchId: string,
    dto: SubmitManualMerchantPaymentDto,
  ): Promise<ManualMerchantPaymentResponseContract> {
    const canManageAll = user.permissions.includes(BILLING_PERMISSIONS.manage);
    if (!canManageAll && user.branchId !== branchId) {
      throw new ForbiddenException('You can only pay for your own branch.');
    }
    if (!canManageAll && !user.branchId) {
      throw new ForbiddenException('You can only pay for your own branch.');
    }

    const bundleId = dto.bundleId?.trim();
    if (!bundleId) {
      throw new BadRequestException('Choose an SMS bundle to continue.');
    }

    const providerDetails = this.manualMerchantDetails(dto.provider);
    const transactionId = this.normalizeManualTransactionId(
      dto.transactionId ?? '',
    );
    if (!transactionId) {
      throw new BadRequestException('Enter the payment transaction ID.');
    }
    const confirmationId = this.normalizeManualTransactionId(
      dto.confirmTransactionId ?? '',
    );
    if (!confirmationId) {
      throw new BadRequestException(
        'Confirm the transaction ID by entering it again.',
      );
    }
    if (
      this.compactTransactionId(transactionId) !==
      this.compactTransactionId(confirmationId)
    ) {
      throw new BadRequestException(
        'The transaction IDs do not match. Check both entries and try again.',
      );
    }

    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenantId: user.tenantId },
      select: { id: true, name: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found.');
    }

    const now = new Date();
    const bundle = await this.prisma.smsBundle.findFirst({
      where: {
        id: bundleId,
        status: SmsBundleStatus.ACTIVE,
        activeFrom: { lte: now },
        OR: [{ activeTo: null }, { activeTo: { gt: now } }],
      },
    });
    if (!bundle) {
      throw new NotFoundException('That SMS bundle is not available.');
    }

    const wallet = await this.prisma.branchSmsWallet.upsert({
      where: { branchId: branch.id },
      update: {},
      create: {
        tenantId: user.tenantId,
        branchId: branch.id,
        availableUnits: 0,
        reservedUnits: 0,
      },
    });

    const merchantReference = this.manualSmsMerchantReference(
      dto.provider,
      transactionId,
    );
    const existing = await this.prisma.smsPurchase.findUnique({
      where: { merchantReference },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'This transaction ID has already been submitted.',
      );
    }

    const existingPending = await this.prisma.smsPurchase.findFirst({
      where: {
        tenantId: user.tenantId,
        branchId: branch.id,
        bundleId: bundle.id,
        initiatedByUserId: user.userId,
        status: {
          in: [
            SmsPurchaseStatus.PAYMENT_PENDING,
            SmsPurchaseStatus.AWAITING_PAYMENT,
            SmsPurchaseStatus.MANUAL_REVIEW,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (
      existingPending &&
      this.isManualMerchantPayload(existingPending.rawPayload)
    ) {
      throw new ConflictException(
        'A payment request for this purchase is already pending. Cancel it before submitting another transaction ID.',
      );
    }

    const rawPayload = {
      manualMerchant: true,
      purchase_kind: 'sms',
      provider: dto.provider,
      payment_method: providerDetails.historyLabel,
      transaction_id: transactionId,
      merchant_code: providerDetails.merchantCode,
      account_name: providerDetails.accountName,
      bundle_id: bundle.id,
      bundle_name: bundle.name,
      sms_units: bundle.smsUnits,
      pahappa_credit_reminder: true,
      submitted_by_user_id: user.userId,
      submitted_at: new Date().toISOString(),
    } satisfies Prisma.InputJsonObject;

    try {
      const purchase = await this.prisma.smsPurchase.create({
        data: {
          tenantId: user.tenantId,
          branchId: branch.id,
          walletId: wallet.id,
          bundleId: bundle.id,
          bundleVersion: bundle.version,
          bundleNameSnapshot: bundle.name,
          initiatedByUserId: user.userId,
          amountExpected: bundle.priceUgx,
          currency: 'UGX',
          smsUnitsExpected: bundle.smsUnits,
          merchantReference,
          status: SmsPurchaseStatus.AWAITING_PAYMENT,
          rawPayload,
          expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
        include: {
          branch: { select: { name: true } },
        },
      });

      const alertedPurchase = await this.sendManualSmsPaymentVerificationAlert(
        purchase,
        {
          transactionId,
          paymentMethod: providerDetails.historyLabel,
          merchantCode: providerDetails.merchantCode,
          submittedByName: user.displayName || user.email || 'REMBEH user',
          submittedByEmail: user.email ?? null,
        },
      );
      const responsePurchase = alertedPurchase ?? purchase;
      this.emitSmsPurchasePaymentUpdate(responsePurchase);

      return {
        payment: this.toSmsPurchasePaymentRow(responsePurchase),
        message:
          'Payment submitted for verification. We will credit your SMS wallet after confirmation.',
      };
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        throw new ConflictException(
          'This transaction ID has already been submitted.',
        );
      }
      throw error;
    }
  }

  async cancelManualMerchantPayment(
    user: AuthenticatedUser,
    paymentId: string,
  ): Promise<ManualMerchantPaymentResponseContract> {
    const canManageAll = user.permissions.includes(BILLING_PERMISSIONS.manage);
    const payment = await this.prisma.subscriptionPayment.findFirst({
      where: { id: paymentId, tenantId: user.tenantId },
      include: SUBSCRIPTION_PAYMENT_ROW_INCLUDE,
    });

    if (!payment) {
      return this.cancelManualSmsMerchantPayment(user, paymentId);
    }
    if (!canManageAll && user.branchId !== payment.branchId) {
      throw new ForbiddenException(
        'You can only cancel payments for your own branch.',
      );
    }
    if (payment.status !== SubscriptionPaymentStatus.PENDING) {
      throw new BadRequestException(
        'Only pending payment requests can be cancelled.',
      );
    }
    if (!this.isManualMerchantPayload(payment.rawPayload)) {
      throw new BadRequestException(
        'Only merchant payment requests can be cancelled.',
      );
    }

    const rawPayload = {
      ...(this.payloadObject(payment.rawPayload) ?? {}),
      cancelled_by_user_id: user.userId,
      cancelled_at: new Date().toISOString(),
    } satisfies Prisma.InputJsonObject;

    const updated = await this.prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: {
        status: SubscriptionPaymentStatus.CANCELLED,
        rawPayload,
      },
      include: SUBSCRIPTION_PAYMENT_ROW_INCLUDE,
    });

    this.emitSubscriptionPaymentUpdate(updated);

    return {
      payment: this.toSubscriptionPaymentRow(updated),
      message:
        'Payment request cancelled. You can submit a new transaction ID.',
    };
  }

  private async cancelManualSmsMerchantPayment(
    user: AuthenticatedUser,
    paymentId: string,
  ): Promise<ManualMerchantPaymentResponseContract> {
    const canManageAll = user.permissions.includes(BILLING_PERMISSIONS.manage);
    const purchase = await this.prisma.smsPurchase.findFirst({
      where: { id: paymentId, tenantId: user.tenantId },
      include: { branch: { select: { name: true } } },
    });

    if (!purchase) {
      throw new NotFoundException('Payment request not found.');
    }
    if (!canManageAll && user.branchId !== purchase.branchId) {
      throw new ForbiddenException(
        'You can only cancel payments for your own branch.',
      );
    }
    if (!this.isPendingManualSmsPurchase(purchase.status)) {
      throw new BadRequestException(
        'Only pending payment requests can be cancelled.',
      );
    }
    if (!this.isManualMerchantPayload(purchase.rawPayload)) {
      throw new BadRequestException(
        'Only merchant payment requests can be cancelled.',
      );
    }

    const rawPayload = {
      ...(this.payloadObject(purchase.rawPayload) ?? {}),
      cancelled_by_user_id: user.userId,
      cancelled_at: new Date().toISOString(),
    } satisfies Prisma.InputJsonObject;

    const updated = await this.prisma.smsPurchase.update({
      where: { id: purchase.id },
      data: {
        status: SmsPurchaseStatus.CANCELLED_BY_USER,
        rawPayload,
      },
      include: { branch: { select: { name: true } } },
    });

    this.emitSmsPurchasePaymentUpdate(updated);

    return {
      payment: this.toSmsPurchasePaymentRow(updated),
      message:
        'Payment request cancelled. You can submit a new transaction ID.',
    };
  }

  async handleResendPaymentWebhook(
    payload: string,
    headers: ResendWebhookHeaders,
  ) {
    const event = this.verifyResendWebhook(payload, headers);
    if (event.type !== 'email.received') {
      return { ok: true, ignored: true, reason: 'unsupported_event' };
    }

    const emailId = event.data?.email_id?.trim();
    if (!emailId) {
      this.logger.warn('Resend payment webhook ignored: missing email_id.');
      return { ok: true, ignored: true, reason: 'missing_email_id' };
    }
    this.logger.log(`Resend payment webhook received email=${emailId}`);

    const received =
      await this.notificationsService.retrieveReceivedEmail(emailId);
    if (!received) {
      this.logger.warn(
        `Resend payment webhook ignored: received email ${emailId} could not be fetched.`,
      );
      return { ok: true, ignored: true, reason: 'email_not_available' };
    }

    const fromEmail = this.extractEmailAddress(received.from);
    if (!fromEmail || !this.paymentReplyAllowedEmails().has(fromEmail)) {
      this.logger.warn(
        `Ignored payment verification reply from untrusted sender: ${received.from}`,
      );
      return { ok: true, ignored: true, reason: 'sender_not_allowed' };
    }

    const command = this.parsePaymentVerificationReply(
      received.text ?? this.htmlToText(received.html ?? ''),
    );
    if (!command) {
      this.logger.warn(
        `Resend payment webhook ignored: no verification command found in email=${emailId} from=${fromEmail}.`,
      );
      return { ok: true, ignored: true, reason: 'command_not_found' };
    }

    if (command.action === 'fail') {
      const paymentId = this.extractPaymentIdFromEmail({
        subject: received.subject,
        text: received.text,
        html: received.html,
        to: received.to,
        receivedFor: received.received_for,
      });
      if (!paymentId) {
        return { ok: true, ignored: true, reason: 'payment_id_not_found' };
      }

      const payment = await this.prisma.subscriptionPayment.findUnique({
        where: { id: paymentId },
        include: SUBSCRIPTION_PAYMENT_ROW_INCLUDE,
      });
      if (payment) {
        if (!this.isManualMerchantPayload(payment.rawPayload)) {
          return { ok: true, ignored: true, reason: 'payment_not_found' };
        }
        if (payment.status === SubscriptionPaymentStatus.COMPLETED) {
          return { ok: true, ignored: true, reason: 'already_completed' };
        }
        if (payment.status !== SubscriptionPaymentStatus.PENDING) {
          return { ok: true, ignored: true, reason: 'payment_not_pending' };
        }

        const updated = await this.failManualMerchantPayment(payment, {
          reason: command.reason || 'Payment could not be verified.',
          replyEmailId: emailId,
          replyFromEmail: fromEmail,
          merchantTransactionId: null,
        });
        this.logger.log(
          `Manual merchant payment ${updated.id} failed from Resend reply email=${emailId} by=${fromEmail}`,
        );
        return {
          ok: true,
          paymentId,
          status: updated.status,
          matched: false,
        };
      }

      const purchase = await this.prisma.smsPurchase.findUnique({
        where: { id: paymentId },
        include: { branch: { select: { name: true } } },
      });
      if (!purchase || !this.isManualMerchantPayload(purchase.rawPayload)) {
        return { ok: true, ignored: true, reason: 'payment_not_found' };
      }
      if (purchase.status === SmsPurchaseStatus.CREDITED) {
        return { ok: true, ignored: true, reason: 'already_completed' };
      }
      if (!this.isPendingManualSmsPurchase(purchase.status)) {
        return { ok: true, ignored: true, reason: 'payment_not_pending' };
      }

      const updated = await this.failManualSmsMerchantPayment(purchase, {
        reason: command.reason || 'Payment could not be verified.',
        replyEmailId: emailId,
        replyFromEmail: fromEmail,
        merchantTransactionId: null,
      });
      this.logger.log(
        `Manual SMS merchant payment ${updated.id} failed from Resend reply email=${emailId} by=${fromEmail}`,
      );
      return {
        ok: true,
        paymentId,
        status: updated.status,
        matched: false,
      };
    }

    const result = await this.confirmManualMerchantPaymentsFromReply({
      transactionIds: command.transactionIds,
      replyEmailId: emailId,
      replyFromEmail: fromEmail,
    });
    this.logger.log(
      `Resend payment reply email=${emailId} by=${fromEmail} replied=${result.repliedCount ?? 0} matched=${result.matchedCount ?? 0} remaining=${result.remainingCount ?? 0}`,
    );
    return result;
  }

  private async confirmManualMerchantPaymentsFromReply(input: {
    transactionIds: string[];
    replyEmailId: string;
    replyFromEmail: string;
  }) {
    const transactionIds = this.uniqueManualTransactionIds(
      input.transactionIds,
    );
    if (transactionIds.length === 0) {
      return { ok: true, ignored: true, reason: 'transaction_ids_not_found' };
    }

    const [pendingPayments, pendingSmsPurchases] = await Promise.all([
      this.prisma.subscriptionPayment.findMany({
        where: { status: SubscriptionPaymentStatus.PENDING },
        include: SUBSCRIPTION_PAYMENT_TENANT_INCLUDE,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.smsPurchase.findMany({
        where: {
          status: {
            in: [
              SmsPurchaseStatus.PAYMENT_PENDING,
              SmsPurchaseStatus.AWAITING_PAYMENT,
              SmsPurchaseStatus.MANUAL_REVIEW,
            ],
          },
        },
        include: {
          branch: { select: { name: true } },
          tenant: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const manualPending: ManualPendingPayment[] = [
      ...pendingPayments
        .filter((payment) => this.isManualMerchantPayload(payment.rawPayload))
        .map((payment) => ({
          kind: 'subscription' as const,
          id: payment.id,
          payment,
        })),
      ...pendingSmsPurchases
        .filter((purchase) => this.isManualMerchantPayload(purchase.rawPayload))
        .map((purchase) => ({
          kind: 'sms' as const,
          id: purchase.id,
          purchase,
        })),
    ];

    const pendingByTransactionId = new Map<string, ManualPendingPayment[]>();
    for (const item of manualPending) {
      const submittedId = this.submittedManualTransactionId(
        item.kind === 'subscription'
          ? item.payment.rawPayload
          : item.purchase.rawPayload,
      );
      const submittedCompact = this.compactTransactionId(submittedId ?? '');
      if (!submittedCompact) continue;

      const matches = pendingByTransactionId.get(submittedCompact) ?? [];
      matches.push(item);
      pendingByTransactionId.set(submittedCompact, matches);
    }

    const matched: Array<{
      item: ManualPendingPayment;
      transactionId: string;
    }> = [];
    const matchedPaymentIds = new Set<string>();
    const unmatchedIds: string[] = [];
    const ambiguousIds: string[] = [];

    for (const transactionId of transactionIds) {
      const compact = this.compactTransactionId(transactionId);
      const matches = pendingByTransactionId.get(compact) ?? [];
      if (matches.length === 0) {
        unmatchedIds.push(transactionId);
        continue;
      }
      if (matches.length > 1) {
        ambiguousIds.push(transactionId);
        continue;
      }

      const item = matches[0];
      if (!matchedPaymentIds.has(item.id)) {
        matched.push({ item, transactionId });
        matchedPaymentIds.add(item.id);
      }
    }

    for (const item of matched) {
      if (item.item.kind === 'subscription') {
        await this.completeManualMerchantPayment(item.item.payment, {
          replyEmailId: input.replyEmailId,
          replyFromEmail: input.replyFromEmail,
          merchantTransactionId: item.transactionId,
        });
      } else {
        await this.completeManualSmsMerchantPayment(item.item.purchase, {
          replyEmailId: input.replyEmailId,
          replyFromEmail: input.replyFromEmail,
          merchantTransactionId: item.transactionId,
        });
      }
    }

    const remaining = manualPending.filter(
      (item) => !matchedPaymentIds.has(item.id),
    );
    await this.sendManualPaymentVerificationSummary({
      confirmed: matched.map((item) =>
        this.toManualPaymentSummaryItem(item.item),
      ),
      remaining: remaining.map((item) => this.toManualPaymentSummaryItem(item)),
      unmatchedIds,
      ambiguousIds,
      replyFromEmail: input.replyFromEmail,
    });

    return {
      ok: true,
      matched: matched.length > 0,
      matchedCount: matched.length,
      repliedCount: transactionIds.length,
      remainingCount: remaining.length,
      unmatchedIds,
      ambiguousIds,
      matchedPaymentIds: matched.map((item) => item.item.id),
    };
  }

  async handlePesapalNotification(query: {
    OrderTrackingId?: string;
    OrderMerchantReference?: string;
    OrderNotificationType?: string;
  }) {
    const trackingId = query.OrderTrackingId?.trim();
    if (!trackingId) {
      return {
        orderNotificationType: query.OrderNotificationType || 'IPNCHANGE',
        orderTrackingId: '',
        orderMerchantReference: query.OrderMerchantReference || '',
        status: 500,
      };
    }

    await this.smsCreditsService.finalizeIfSmsPayment(trackingId);
    await this.finalizePesapalPayment(trackingId);

    return {
      orderNotificationType: query.OrderNotificationType || 'IPNCHANGE',
      orderTrackingId: trackingId,
      orderMerchantReference: query.OrderMerchantReference || '',
      status: 200,
    };
  }

  async handlePesapalCallback(query: {
    OrderTrackingId?: string;
    OrderMerchantReference?: string;
  }) {
    const trackingId = query.OrderTrackingId?.trim();
    let smsBranchId: string | null = null;
    if (trackingId) {
      const smsHandled =
        await this.smsCreditsService.finalizeIfSmsPayment(trackingId);
      if (smsHandled) {
        smsBranchId =
          await this.smsCreditsService.findCompletedSmsBranchId(trackingId);
      } else {
        await this.finalizePesapalPayment(trackingId);
      }
    }

    const webAppUrl = resolveWebAppBaseUrl(this.configService);

    if (smsBranchId) {
      const params = new URLSearchParams({ smsPaid: '1', branch: smsBranchId });
      return `${webAppUrl}/subscription?${params.toString()}`;
    }

    const payment = trackingId
      ? await this.prisma.subscriptionPayment.findFirst({
          where: { orderTrackingId: trackingId },
        })
      : null;

    const params = new URLSearchParams({ tab: 'plan' });
    if (payment) {
      if (payment.status === SubscriptionPaymentStatus.COMPLETED) {
        params.set('paymentResult', 'success');
      } else if (
        payment.status === SubscriptionPaymentStatus.FAILED ||
        payment.status === SubscriptionPaymentStatus.REVERSED
      ) {
        params.set('paymentResult', 'failed');
      }
      params.set('payment', payment.id);
      params.set('branch', payment.branchId);
    }
    return `${webAppUrl}/subscription?${params.toString()}`;
  }

  async assertBranchSubscriptionActive(tenantId: string, branchId: string) {
    await this.ensureTenantBilling(tenantId);
    await this.syncTenantSubscriptions(tenantId);
    let sub = await this.prisma.branchSubscription.findUnique({
      where: { branchId },
    });
    if (!sub) {
      sub = await this.provisionBranchSubscription({ tenantId, branchId });
    }

    if (sub.status === BranchSubscriptionStatus.LOCKED) {
      throw new HttpException(
        'This branch is paused. Renew on Subscription to continue.',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    return sub;
  }

  isBranchMutationsAllowed(status: BranchSubscriptionStatus) {
    return status !== BranchSubscriptionStatus.LOCKED;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async reconcileSubscriptionsCron() {
    try {
      const tenants = await this.prisma.tenantBilling.findMany({
        select: { tenantId: true },
      });
      for (const row of tenants) {
        await this.syncTenantSubscriptions(row.tenantId);
      }
    } catch (error) {
      this.logger.error(
        'Subscription reconcile failed',
        error instanceof Error ? error.stack : error,
      );
    }
  }

  async syncTenantSubscriptions(tenantId: string) {
    await this.ensureTenantBilling(tenantId);
    const plan = await this.ensureProPlan();
    const now = new Date();

    const branches = await this.prisma.branch.findMany({
      where: { tenantId },
      include: { subscription: true },
    });

    for (const branch of branches) {
      let sub = branch.subscription;
      if (!sub) {
        sub = await this.provisionBranchSubscription({
          tenantId,
          branchId: branch.id,
        });
      }

      const trial = this.branchTrialWindow(branch);
      const trialActive = trial.endsAt.getTime() > now.getTime();

      if (trialActive) {
        if (sub.status === BranchSubscriptionStatus.TRIAL) {
          sub = await this.prisma.branchSubscription.update({
            where: { id: sub.id },
            data: {
              status: BranchSubscriptionStatus.TRIAL,
              currentPeriodStart: trial.startsAt,
              currentPeriodEnd: trial.endsAt,
              graceEndsAt: null,
              lockedAt: null,
              planId: plan.id,
            },
          });
          const trialDaysRemaining = this.daysUntil(trial.endsAt, now);
          if (SUBSCRIPTION_EXPIRY_REMINDER_DAYS.has(trialDaysRemaining)) {
            await this.maybeNotifyBranchSubscriptionReminder({
              tenantId,
              branchId: branch.id,
              branchName: branch.name,
              subscriptionId: sub.id,
              lastReminderAt: sub.lastReminderAt,
              now,
              kind: 'trial_ending',
              daysRemaining: trialDaysRemaining,
              periodEnd: trial.endsAt,
            });
          }
        } else if (
          sub.status === BranchSubscriptionStatus.ACTIVE &&
          sub.currentPeriodEnd &&
          sub.currentPeriodEnd.getTime() > now.getTime()
        ) {
          const daysRemaining = this.daysUntil(sub.currentPeriodEnd, now);
          if (SUBSCRIPTION_EXPIRY_REMINDER_DAYS.has(daysRemaining)) {
            await this.maybeNotifyBranchSubscriptionReminder({
              tenantId,
              branchId: branch.id,
              branchName: branch.name,
              subscriptionId: sub.id,
              lastReminderAt: sub.lastReminderAt,
              now,
              kind: 'expires_soon',
              daysRemaining,
              periodEnd: sub.currentPeriodEnd,
            });
          }
        }
        continue;
      }

      // Trial over
      if (sub.status === BranchSubscriptionStatus.TRIAL) {
        const graceEndsAt = new Date(
          now.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000,
        );
        await this.prisma.branchSubscription.update({
          where: { id: sub.id },
          data: {
            status: BranchSubscriptionStatus.GRACE,
            graceEndsAt,
            currentPeriodEnd: trial.endsAt,
            lastReminderAt: now,
          },
        });
        void this.notifyOwnersBranchNeedsSubscription({
          tenantId,
          branchId: branch.id,
          branchName: branch.name,
          kind: 'grace',
          daysRemaining: GRACE_DAYS,
          graceEndsAt,
        });
        continue;
      }

      if (
        sub.status === BranchSubscriptionStatus.ACTIVE &&
        sub.currentPeriodEnd &&
        sub.currentPeriodEnd.getTime() < now.getTime()
      ) {
        const graceEndsAt = new Date(
          now.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000,
        );
        await this.prisma.branchSubscription.update({
          where: { id: sub.id },
          data: {
            status: BranchSubscriptionStatus.GRACE,
            graceEndsAt,
            lastReminderAt: now,
          },
        });
        void this.notifyOwnersBranchNeedsSubscription({
          tenantId,
          branchId: branch.id,
          branchName: branch.name,
          kind: 'grace',
          daysRemaining: GRACE_DAYS,
          graceEndsAt,
        });
        continue;
      }

      if (
        sub.status === BranchSubscriptionStatus.ACTIVE &&
        sub.currentPeriodEnd &&
        sub.currentPeriodEnd.getTime() >= now.getTime()
      ) {
        const daysRemaining = this.daysUntil(sub.currentPeriodEnd, now);
        if (SUBSCRIPTION_EXPIRY_REMINDER_DAYS.has(daysRemaining)) {
          await this.maybeNotifyBranchSubscriptionReminder({
            tenantId,
            branchId: branch.id,
            branchName: branch.name,
            subscriptionId: sub.id,
            lastReminderAt: sub.lastReminderAt,
            now,
            kind: 'expires_soon',
            daysRemaining,
            periodEnd: sub.currentPeriodEnd,
          });
        }
      }

      if (
        sub.status === BranchSubscriptionStatus.GRACE &&
        sub.graceEndsAt &&
        sub.graceEndsAt.getTime() >= now.getTime()
      ) {
        await this.maybeNotifyBranchSubscriptionReminder({
          tenantId,
          branchId: branch.id,
          branchName: branch.name,
          subscriptionId: sub.id,
          lastReminderAt: sub.lastReminderAt,
          now,
          kind: 'grace',
          daysRemaining: this.daysUntil(sub.graceEndsAt, now),
          graceEndsAt: sub.graceEndsAt,
        });
      }

      if (
        sub.status === BranchSubscriptionStatus.GRACE &&
        sub.graceEndsAt &&
        sub.graceEndsAt.getTime() < now.getTime()
      ) {
        await this.prisma.branchSubscription.update({
          where: { id: sub.id },
          data: {
            status: BranchSubscriptionStatus.LOCKED,
            lockedAt: now,
            lastReminderAt: now,
          },
        });
        void this.notifyOwnersBranchNeedsSubscription({
          tenantId,
          branchId: branch.id,
          branchName: branch.name,
          kind: 'locked',
          daysRemaining: 0,
        });
      }
    }
  }

  private async finalizePesapalPayment(orderTrackingId: string) {
    const status = await this.pesapal.getTransactionStatus(orderTrackingId);
    const payment = await this.prisma.subscriptionPayment.findFirst({
      where: {
        OR: [
          { orderTrackingId },
          {
            merchantReference: status.merchant_reference || undefined,
          },
        ],
      },
    });
    if (!payment) {
      return;
    }

    const description = (status.payment_status_description || '').toLowerCase();
    // Pesapal status_code: 0 INVALID, 1 COMPLETED, 2 FAILED, 3 REVERSED
    const statusCode = Number(
      (status as { status_code?: number | string }).status_code ??
        status.payment_status_code ??
        NaN,
    );
    const completed = statusCode === 1 || description.includes('completed');

    if (!completed) {
      await this.prisma.subscriptionPayment.update({
        where: { id: payment.id },
        data: {
          orderTrackingId,
          rawPayload: status as Prisma.InputJsonValue,
          status:
            statusCode === 2 ||
            statusCode === 0 ||
            description.includes('failed') ||
            description.includes('invalid')
              ? SubscriptionPaymentStatus.FAILED
              : statusCode === 3 || description.includes('reversed')
                ? SubscriptionPaymentStatus.REVERSED
                : SubscriptionPaymentStatus.PENDING,
        },
      });
      return;
    }

    if (payment.status === SubscriptionPaymentStatus.COMPLETED) {
      return;
    }

    const priorCompleted = await this.prisma.subscriptionPayment.count({
      where: {
        branchId: payment.branchId,
        status: SubscriptionPaymentStatus.COMPLETED,
        id: { not: payment.id },
      },
    });
    const isFirstPlanPurchase = priorCompleted === 0;

    const now = new Date();
    const sub = await this.prisma.branchSubscription.findUnique({
      where: { branchId: payment.branchId },
    });
    const paidPlan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: payment.planId },
    });
    const months = monthsForInterval(paidPlan?.interval ?? 'MONTHLY');
    const { periodStart, periodEnd } =
      await this.resolveSubscriptionActivationPeriod({
        tenantId: payment.tenantId,
        sub,
        months,
        now,
      });
    const rawPayload = {
      ...(this.payloadObject(status as Prisma.JsonValue) ?? {}),
      subscription_active_from: periodStart.toISOString(),
      subscription_active_until: periodEnd.toISOString(),
    } satisfies Prisma.InputJsonObject;

    await this.prisma.$transaction(async (tx) => {
      await tx.subscriptionPayment.update({
        where: { id: payment.id },
        data: {
          status: SubscriptionPaymentStatus.COMPLETED,
          orderTrackingId,
          paidAt: now,
          rawPayload,
        },
      });

      await tx.branchSubscription.update({
        where: { branchId: payment.branchId },
        data: {
          status: BranchSubscriptionStatus.ACTIVE,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          graceEndsAt: null,
          lockedAt: null,
          planId: payment.planId,
        },
      });
    });

    this.logger.log(
      `Branch ${payment.branchId} subscription activated until ${periodEnd.toISOString()}`,
    );

    if (isFirstPlanPurchase) {
      try {
        const welcome = await this.smsCreditsService.grantProWelcomeSmsCredits({
          tenantId: payment.tenantId,
          branchId: payment.branchId,
        });
        if (welcome.granted) {
          this.logger.log(
            `Branch ${payment.branchId} received ${welcome.credits} Pro welcome SMS credits`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to grant Pro welcome SMS credits for branch ${payment.branchId}`,
          error instanceof Error ? error.stack : error,
        );
      }
    }
  }

  private daysUntil(value: Date, now = new Date()) {
    return Math.max(0, Math.ceil((value.getTime() - now.getTime()) / DAY_MS));
  }

  private branchTrialWindow(branch: { createdAt: Date }) {
    const startsAt = branch.createdAt;
    const endsAt = new Date(startsAt.getTime() + TRIAL_DAYS * DAY_MS);

    return { startsAt, endsAt };
  }

  private canSendBillingReminder(lastReminderAt: Date | null, now: Date) {
    return (
      !lastReminderAt ||
      now.getTime() - lastReminderAt.getTime() >= BILLING_REMINDER_COOLDOWN_MS
    );
  }

  private async maybeNotifyBranchSubscriptionReminder(input: {
    tenantId: string;
    branchId: string;
    branchName: string;
    subscriptionId: string;
    lastReminderAt: Date | null;
    now: Date;
    kind: SubscriptionOwnerReminderKind;
    daysRemaining: number;
    periodEnd?: Date | null;
    graceEndsAt?: Date | null;
  }) {
    if (!this.canSendBillingReminder(input.lastReminderAt, input.now)) {
      return;
    }

    await this.prisma.branchSubscription.update({
      where: { id: input.subscriptionId },
      data: { lastReminderAt: input.now },
    });

    void this.notifyOwnersBranchNeedsSubscription({
      tenantId: input.tenantId,
      branchId: input.branchId,
      branchName: input.branchName,
      kind: input.kind,
      daysRemaining: input.daysRemaining,
      periodEnd: input.periodEnd ?? null,
      graceEndsAt: input.graceEndsAt ?? null,
    });
  }

  private reminderFor(
    sub: {
      status: BranchSubscriptionStatus;
      currentPeriodEnd: Date | null;
      graceEndsAt: Date | null;
      lastReminderAt: Date | null;
    },
    branchName: string,
  ): string | null {
    if (sub.status === BranchSubscriptionStatus.GRACE) {
      const days = sub.graceEndsAt
        ? Math.max(
            0,
            Math.ceil((sub.graceEndsAt.getTime() - Date.now()) / DAY_MS),
          )
        : GRACE_DAYS;
      return `${branchName} needs renewing within ${days} day${days === 1 ? '' : 's'} to stay open.`;
    }
    if (sub.status === BranchSubscriptionStatus.LOCKED) {
      return `${branchName} is paused — renew to continue.`;
    }
    if (sub.status === BranchSubscriptionStatus.TRIAL && sub.currentPeriodEnd) {
      const days = Math.ceil(
        (sub.currentPeriodEnd.getTime() - Date.now()) / DAY_MS,
      );
      if (days <= 7 && days >= 0) {
        return days === 0
          ? `${branchName} trial ends today.`
          : `${branchName} trial ends in ${days} day${days === 1 ? '' : 's'}.`;
      }
    }
    if (
      sub.status === BranchSubscriptionStatus.ACTIVE &&
      sub.currentPeriodEnd
    ) {
      const days = Math.ceil(
        (sub.currentPeriodEnd.getTime() - Date.now()) / DAY_MS,
      );
      if (days <= 7 && days >= 0) {
        return days === 0
          ? `${branchName} subscription expires today.`
          : `${branchName} subscription expires in ${days} day${
              days === 1 ? '' : 's'
            }.`;
      }
    }
    return null;
  }

  private async sendManualPaymentVerificationAlert(
    payment: SubscriptionPaymentWithBranchPlan,
    input: {
      transactionId: string;
      paymentMethod: string;
      merchantCode: string;
      submittedByName: string;
      submittedByEmail: string | null;
    },
  ): Promise<SubscriptionPaymentWithBranchPlan | null> {
    const recipients = this.paymentVerificationEmails();
    const replyTo = this.paymentVerificationReplyTo();
    const months = monthsForInterval(payment.plan.interval);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: payment.tenantId },
      select: { name: true },
    });
    const alert = await this.notificationsService
      .sendSubscriptionPaymentVerificationAlertEmail({
        recipients,
        replyTo,
        paymentId: payment.id,
        organizationName: tenant?.name ?? 'Unknown organization',
        branchName: payment.branch.name,
        planLabel:
          months === 1
            ? 'Monthly Subscription'
            : `${months}-Month Subscription`,
        amountLabel: `UGX ${Number(payment.amount).toLocaleString('en-UG')}`,
        paymentMethod: input.paymentMethod,
        merchantCode: input.merchantCode,
        transactionId: input.transactionId,
        submittedByName: input.submittedByName,
        submittedByEmail: input.submittedByEmail,
        submittedAt: this.formatPaymentEmailDate(payment.createdAt),
      })
      .catch((error) => {
        const detail = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Payment verification alert failed: ${detail}`);
        return { delivered: false, error: detail };
      });

    const rawPayload = {
      ...(this.payloadObject(payment.rawPayload) ?? {}),
      admin_alert_recipients: recipients,
      admin_alert_reply_to: replyTo,
      admin_alert_sent_at: new Date().toISOString(),
      admin_alert_delivered: alert.delivered,
      ...(alert.error ? { admin_alert_error: alert.error } : {}),
    } satisfies Prisma.InputJsonObject;

    return this.prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: { rawPayload },
      include: SUBSCRIPTION_PAYMENT_ROW_INCLUDE,
    });
  }

  private async sendManualSmsPaymentVerificationAlert(
    purchase: SmsPurchaseWithBranch,
    input: {
      transactionId: string;
      paymentMethod: string;
      merchantCode: string;
      submittedByName: string;
      submittedByEmail: string | null;
    },
  ): Promise<SmsPurchaseWithBranch | null> {
    const recipients = this.paymentVerificationEmails();
    const replyTo = this.paymentVerificationReplyTo();
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: purchase.tenantId },
      select: { name: true },
    });
    const alert = await this.notificationsService
      .sendSubscriptionPaymentVerificationAlertEmail({
        recipients,
        replyTo,
        paymentId: purchase.id,
        organizationName: tenant?.name ?? 'Unknown organization',
        branchName: purchase.branch.name,
        planLabel: `${purchase.bundleNameSnapshot} SMS Bundle`,
        amountLabel: `UGX ${Number(purchase.amountExpected).toLocaleString(
          'en-UG',
        )}`,
        paymentMethod: input.paymentMethod,
        merchantCode: input.merchantCode,
        transactionId: input.transactionId,
        submittedByName: input.submittedByName,
        submittedByEmail: input.submittedByEmail,
        submittedAt: this.formatPaymentEmailDate(purchase.createdAt),
        teamReminder:
          'Before confirming SMS credits, make sure the Pahappa credit is enough to run this customer SMS subscription.',
      })
      .catch((error) => {
        const detail = error instanceof Error ? error.message : String(error);
        this.logger.warn(`SMS payment verification alert failed: ${detail}`);
        return { delivered: false, error: detail };
      });

    const rawPayload = {
      ...(this.payloadObject(purchase.rawPayload) ?? {}),
      admin_alert_recipients: recipients,
      admin_alert_reply_to: replyTo,
      admin_alert_sent_at: new Date().toISOString(),
      admin_alert_delivered: alert.delivered,
      ...(alert.error ? { admin_alert_error: alert.error } : {}),
    } satisfies Prisma.InputJsonObject;

    return this.prisma.smsPurchase.update({
      where: { id: purchase.id },
      data: { rawPayload },
      include: { branch: { select: { name: true } } },
    });
  }

  private async sendManualPaymentVerificationSummary(input: {
    confirmed: ManualPaymentSummaryItem[];
    remaining: ManualPaymentSummaryItem[];
    unmatchedIds: string[];
    ambiguousIds: string[];
    replyFromEmail: string;
  }) {
    const recipients = this.paymentVerificationEmails();
    const replyTo = this.paymentVerificationReplyTo();

    await this.notificationsService
      .sendSubscriptionPaymentVerificationSummaryEmail({
        recipients,
        replyTo,
        confirmed: input.confirmed,
        remaining: input.remaining,
        unmatchedIds: input.unmatchedIds,
        ambiguousIds: input.ambiguousIds,
        replyFromEmail: input.replyFromEmail,
      })
      .catch((error) => {
        const detail = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Payment verification summary email failed: ${detail}`,
        );
      });
  }

  private toManualPaymentSummaryItem(
    item: ManualPendingPayment,
  ): ManualPaymentSummaryItem {
    if (item.kind === 'sms') {
      const purchase = item.purchase;
      return {
        organizationName: purchase.tenant.name,
        branchName: purchase.branch.name,
        planLabel: `${purchase.bundleNameSnapshot} SMS Bundle`,
        amountLabel: `UGX ${Number(purchase.amountExpected).toLocaleString('en-UG')}`,
        paymentMethod:
          this.payloadString(purchase.rawPayload, ['payment_method']) ||
          this.paymentMethodFromPayload(purchase.rawPayload) ||
          'Merchant payment',
        merchantCode:
          this.payloadString(purchase.rawPayload, ['merchant_code']) || '-',
        transactionId:
          this.submittedManualTransactionId(purchase.rawPayload) || '-',
      };
    }

    const payment = item.payment;
    const months = monthsForInterval(payment.plan.interval);
    return {
      organizationName: payment.tenant.name,
      branchName: payment.branch.name,
      planLabel:
        months === 1 ? 'Monthly Subscription' : `${months}-Month Subscription`,
      amountLabel: `UGX ${Number(payment.amount).toLocaleString('en-UG')}`,
      paymentMethod:
        this.payloadString(payment.rawPayload, ['payment_method']) ||
        this.paymentMethodFromPayload(payment.rawPayload) ||
        'Merchant payment',
      merchantCode:
        this.payloadString(payment.rawPayload, ['merchant_code']) || '-',
      transactionId:
        this.submittedManualTransactionId(payment.rawPayload) || '-',
    };
  }

  private emitSubscriptionPaymentUpdate(
    payment: SubscriptionPaymentWithBranchPlan,
  ) {
    try {
      this.realtime.broadcastSubscriptionPayment(
        REALTIME_EVENTS.subscriptionPaymentUpdated,
        {
          paymentId: payment.id,
          tenantId: payment.tenantId,
          branchId: payment.branchId,
          status: payment.status,
          payment: this.toSubscriptionPaymentRow(payment, {
            useBranchSubscriptionPeriod:
              payment.status === SubscriptionPaymentStatus.COMPLETED,
          }),
        },
      );
    } catch (error) {
      this.logger.warn(
        `Subscription payment realtime emit failed for ${payment.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private emitSmsPurchasePaymentUpdate(purchase: SmsPurchaseWithBranch) {
    try {
      this.realtime.broadcastSubscriptionPayment(
        REALTIME_EVENTS.subscriptionPaymentUpdated,
        {
          paymentId: purchase.id,
          tenantId: purchase.tenantId,
          branchId: purchase.branchId,
          status: purchase.status,
          payment: this.toSmsPurchasePaymentRow(purchase),
        },
      );
    } catch (error) {
      this.logger.warn(
        `SMS payment realtime emit failed for ${purchase.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private verifyResendWebhook(
    payload: string,
    headers: ResendWebhookHeaders,
  ): ResendWebhookEvent {
    const secret = this.configService
      .get<string>('RESEND_WEBHOOK_SECRET')
      ?.trim();
    if (!secret) {
      if (this.isProduction()) {
        throw new ServiceUnavailableException(
          'Resend webhook secret is not configured.',
        );
      }
      return JSON.parse(payload) as ResendWebhookEvent;
    }

    try {
      const webhook = new Webhook(secret);
      return webhook.verify(payload, {
        'svix-id': this.headerValue(headers.id),
        'svix-timestamp': this.headerValue(headers.timestamp),
        'svix-signature': this.headerValue(headers.signature),
      }) as ResendWebhookEvent;
    } catch {
      throw new UnauthorizedException('Invalid Resend webhook signature.');
    }
  }

  private async resolveSubscriptionActivationPeriod(input: {
    tenantId: string;
    sub: {
      status: BranchSubscriptionStatus;
      currentPeriodEnd: Date | null;
    } | null;
    months: number;
    now: Date;
  }) {
    const billing = await this.ensureTenantBilling(input.tenantId);
    const futureBases: Date[] = [];

    if (
      input.sub?.currentPeriodEnd &&
      input.sub.currentPeriodEnd.getTime() > input.now.getTime()
    ) {
      futureBases.push(input.sub.currentPeriodEnd);
    }

    if (
      input.sub?.status === BranchSubscriptionStatus.TRIAL &&
      billing.trialEndsAt.getTime() > input.now.getTime()
    ) {
      futureBases.push(billing.trialEndsAt);
    }

    const periodStart =
      futureBases.length > 0
        ? new Date(
            Math.max(...futureBases.map((candidate) => candidate.getTime())),
          )
        : new Date(input.now);
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + input.months);

    return { periodStart, periodEnd };
  }

  async completeManualSubscriptionPaymentFromControlCenter(input: {
    paymentId: string;
    adminEmail: string;
    transactionId?: string | null;
  }): Promise<SubscriptionPaymentRowContract> {
    const payment = await this.prisma.subscriptionPayment.findUnique({
      where: { id: input.paymentId },
      include: SUBSCRIPTION_PAYMENT_ROW_INCLUDE,
    });

    if (!payment) {
      throw new NotFoundException('Subscription payment not found.');
    }

    if (payment.status === SubscriptionPaymentStatus.COMPLETED) {
      return this.toSubscriptionPaymentRow(payment, {
        useBranchSubscriptionPeriod: true,
      });
    }

    if (payment.status !== SubscriptionPaymentStatus.PENDING) {
      throw new ConflictException(
        'Only pending subscription payments can be verified.',
      );
    }

    if (!this.isManualMerchantPayload(payment.rawPayload)) {
      throw new BadRequestException(
        'Only manual merchant subscription payments can be verified in Control Center.',
      );
    }

    const transactionId =
      input.transactionId?.trim() ||
      this.submittedManualTransactionId(payment.rawPayload) ||
      payment.orderTrackingId ||
      payment.merchantReference;

    const updated = await this.completeManualMerchantPayment(payment, {
      replyEmailId: `control-center:${payment.id}:${Date.now()}`,
      replyFromEmail: input.adminEmail,
      merchantTransactionId: transactionId,
    });

    return this.toSubscriptionPaymentRow(updated, {
      useBranchSubscriptionPeriod: true,
    });
  }

  async rejectManualSubscriptionPaymentFromControlCenter(input: {
    paymentId: string;
    adminEmail: string;
    reason: string;
    transactionId?: string | null;
  }): Promise<SubscriptionPaymentRowContract> {
    const payment = await this.prisma.subscriptionPayment.findUnique({
      where: { id: input.paymentId },
      include: SUBSCRIPTION_PAYMENT_ROW_INCLUDE,
    });

    if (!payment) {
      throw new NotFoundException('Subscription payment not found.');
    }

    if (payment.status === SubscriptionPaymentStatus.FAILED) {
      return this.toSubscriptionPaymentRow(payment);
    }

    if (payment.status !== SubscriptionPaymentStatus.PENDING) {
      throw new ConflictException(
        'Only pending subscription payments can be rejected.',
      );
    }

    if (!this.isManualMerchantPayload(payment.rawPayload)) {
      throw new BadRequestException(
        'Only manual merchant subscription payments can be rejected in Control Center.',
      );
    }

    const updated = await this.failManualMerchantPayment(payment, {
      replyEmailId: `control-center:${payment.id}:${Date.now()}`,
      replyFromEmail: input.adminEmail,
      reason: input.reason.trim(),
      merchantTransactionId:
        input.transactionId?.trim() ||
        this.submittedManualTransactionId(payment.rawPayload) ||
        null,
    });

    return this.toSubscriptionPaymentRow(updated);
  }

  async completeManualSmsPaymentFromControlCenter(input: {
    paymentId: string;
    adminEmail: string;
    transactionId?: string | null;
  }): Promise<SubscriptionPaymentRowContract> {
    const purchase = await this.prisma.smsPurchase.findUnique({
      where: { id: input.paymentId },
      include: { branch: { select: { name: true } } },
    });

    if (!purchase) {
      throw new NotFoundException('SMS payment request not found.');
    }

    if (purchase.status === SmsPurchaseStatus.CREDITED) {
      return this.toSmsPurchasePaymentRow(purchase);
    }

    if (!this.isPendingManualSmsPurchase(purchase.status)) {
      throw new ConflictException('Only pending SMS payments can be verified.');
    }

    if (!this.isManualMerchantPayload(purchase.rawPayload)) {
      throw new BadRequestException(
        'Only manual merchant SMS payments can be verified in Control Center.',
      );
    }

    const transactionId =
      input.transactionId?.trim() ||
      this.submittedManualTransactionId(purchase.rawPayload) ||
      purchase.externalTransactionId ||
      purchase.pesapalOrderTrackingId ||
      purchase.merchantReference;

    const updated = await this.completeManualSmsMerchantPayment(purchase, {
      replyEmailId: `control-center:${purchase.id}:${Date.now()}`,
      replyFromEmail: input.adminEmail,
      merchantTransactionId: transactionId,
    });

    return this.toSmsPurchasePaymentRow(updated);
  }

  async rejectManualSmsPaymentFromControlCenter(input: {
    paymentId: string;
    adminEmail: string;
    reason: string;
    transactionId?: string | null;
  }): Promise<SubscriptionPaymentRowContract> {
    const purchase = await this.prisma.smsPurchase.findUnique({
      where: { id: input.paymentId },
      include: { branch: { select: { name: true } } },
    });

    if (!purchase) {
      throw new NotFoundException('SMS payment request not found.');
    }

    if (
      purchase.status === SmsPurchaseStatus.PAYMENT_FAILED ||
      purchase.status === SmsPurchaseStatus.PAYMENT_MISMATCH ||
      purchase.status === SmsPurchaseStatus.EXPIRED ||
      purchase.status === SmsPurchaseStatus.REVERSED ||
      purchase.status === SmsPurchaseStatus.CANCELLED_BY_USER
    ) {
      return this.toSmsPurchasePaymentRow(purchase);
    }

    if (!this.isPendingManualSmsPurchase(purchase.status)) {
      throw new ConflictException('Only pending SMS payments can be rejected.');
    }

    if (!this.isManualMerchantPayload(purchase.rawPayload)) {
      throw new BadRequestException(
        'Only manual merchant SMS payments can be rejected in Control Center.',
      );
    }

    const updated = await this.failManualSmsMerchantPayment(purchase, {
      replyEmailId: `control-center:${purchase.id}:${Date.now()}`,
      replyFromEmail: input.adminEmail,
      reason: input.reason.trim(),
      merchantTransactionId:
        input.transactionId?.trim() ||
        this.submittedManualTransactionId(purchase.rawPayload) ||
        null,
    });

    return this.toSmsPurchasePaymentRow(updated);
  }

  private async completeManualMerchantPayment(
    payment: SubscriptionPaymentWithBranchPlan,
    input: {
      replyEmailId: string;
      replyFromEmail: string;
      merchantTransactionId: string;
    },
  ) {
    const priorCompleted = await this.prisma.subscriptionPayment.count({
      where: {
        branchId: payment.branchId,
        status: SubscriptionPaymentStatus.COMPLETED,
        id: { not: payment.id },
      },
    });
    const isFirstPlanPurchase = priorCompleted === 0;
    const now = new Date();
    const sub = await this.prisma.branchSubscription.findUnique({
      where: { branchId: payment.branchId },
    });
    const months = monthsForInterval(payment.plan.interval);
    const { periodStart, periodEnd } =
      await this.resolveSubscriptionActivationPeriod({
        tenantId: payment.tenantId,
        sub,
        months,
        now,
      });
    const rawPayload = {
      ...(this.payloadObject(payment.rawPayload) ?? {}),
      merchant_confirmed_transaction_id: input.merchantTransactionId,
      verification_reply_email_id: input.replyEmailId,
      verified_by: input.replyFromEmail,
      verified_by_name: input.replyFromEmail,
      verified_at: now.toISOString(),
      subscription_active_from: periodStart.toISOString(),
      subscription_active_until: periodEnd.toISOString(),
    } satisfies Prisma.InputJsonObject;

    await this.prisma.$transaction(async (tx) => {
      await tx.subscriptionPayment.update({
        where: { id: payment.id },
        data: {
          status: SubscriptionPaymentStatus.COMPLETED,
          paidAt: now,
          rawPayload,
        },
      });

      await tx.branchSubscription.update({
        where: { branchId: payment.branchId },
        data: {
          status: BranchSubscriptionStatus.ACTIVE,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          graceEndsAt: null,
          lockedAt: null,
          planId: payment.planId,
        },
      });
    });

    this.logger.log(
      `Manual merchant payment ${payment.id} activated branch ${payment.branchId} until ${periodEnd.toISOString()}`,
    );

    if (isFirstPlanPurchase) {
      try {
        await this.smsCreditsService.grantProWelcomeSmsCredits({
          tenantId: payment.tenantId,
          branchId: payment.branchId,
        });
      } catch (error) {
        this.logger.error(
          `Failed to grant Pro welcome SMS credits for branch ${payment.branchId}`,
          error instanceof Error ? error.stack : error,
        );
      }
    }

    const updated = await this.prisma.subscriptionPayment.findUniqueOrThrow({
      where: { id: payment.id },
      include: SUBSCRIPTION_PAYMENT_ROW_INCLUDE,
    });
    this.emitSubscriptionPaymentUpdate(updated);
    return updated;
  }

  private async failManualMerchantPayment(
    payment: SubscriptionPaymentWithBranchPlan,
    input: {
      reason: string;
      replyEmailId: string;
      replyFromEmail: string;
      merchantTransactionId: string | null;
    },
  ) {
    const rawPayload = {
      ...(this.payloadObject(payment.rawPayload) ?? {}),
      failure_reason: input.reason,
      merchant_confirmed_transaction_id: input.merchantTransactionId,
      verification_reply_email_id: input.replyEmailId,
      failed_by: input.replyFromEmail,
      failed_at: new Date().toISOString(),
    } satisfies Prisma.InputJsonObject;

    const updated = await this.prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: {
        status: SubscriptionPaymentStatus.FAILED,
        rawPayload,
      },
      include: SUBSCRIPTION_PAYMENT_ROW_INCLUDE,
    });
    this.emitSubscriptionPaymentUpdate(updated);
    return updated;
  }

  private async completeManualSmsMerchantPayment(
    purchase: SmsPurchaseWithBranch,
    input: {
      replyEmailId: string;
      replyFromEmail: string;
      merchantTransactionId: string;
    },
  ) {
    const now = new Date();
    const rawPayload = {
      ...(this.payloadObject(purchase.rawPayload) ?? {}),
      merchant_confirmed_transaction_id: input.merchantTransactionId,
      verification_reply_email_id: input.replyEmailId,
      verified_by: input.replyFromEmail,
      verified_by_name: input.replyFromEmail,
      verified_at: now.toISOString(),
    } satisfies Prisma.InputJsonObject;

    const updated = await this.smsCreditsService.creditManualMerchantPurchase({
      purchaseId: purchase.id,
      merchantTransactionId: input.merchantTransactionId,
      rawPayload,
    });
    this.emitSmsPurchasePaymentUpdate(updated);
    this.logger.log(
      `Manual SMS merchant payment ${purchase.id} credited ${purchase.smsUnitsExpected} SMS for branch ${purchase.branchId}`,
    );
    return updated;
  }

  private async failManualSmsMerchantPayment(
    purchase: SmsPurchaseWithBranch,
    input: {
      reason: string;
      replyEmailId: string;
      replyFromEmail: string;
      merchantTransactionId: string | null;
    },
  ) {
    const rawPayload = {
      ...(this.payloadObject(purchase.rawPayload) ?? {}),
      failure_reason: input.reason,
      merchant_confirmed_transaction_id: input.merchantTransactionId,
      verification_reply_email_id: input.replyEmailId,
      failed_by: input.replyFromEmail,
      failed_at: new Date().toISOString(),
    } satisfies Prisma.InputJsonObject;

    const updated = await this.prisma.smsPurchase.update({
      where: { id: purchase.id },
      data: {
        status: SmsPurchaseStatus.PAYMENT_FAILED,
        rawPayload,
      },
      include: { branch: { select: { name: true } } },
    });
    this.emitSmsPurchasePaymentUpdate(updated);
    return updated;
  }

  private parsePaymentVerificationReply(
    text: string,
  ): PaymentReplyCommand | null {
    const reply = this.extractTopReplyText(text);
    const lines = reply
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 8);

    for (const line of lines) {
      const fail = line.match(
        /^(fail|failed|reject|rejected|not\s+found|no\s+match)\b[:\-\s]*(.*)$/i,
      );
      if (fail) {
        return {
          action: 'fail',
          reason: fail[2]?.trim() || 'Transaction could not be found.',
        };
      }
    }

    const transactionIds = this.extractMerchantTransactionIds(lines.join('\n'));
    if (transactionIds.length > 0) {
      return { action: 'confirm', transactionIds };
    }

    return null;
  }

  private extractMerchantTransactionIds(text: string) {
    const reply = text
      .replace(/\b(and|&)\b/gi, ',')
      .replace(
        /^(confirm|confirmed|paid|received|match|matched|ids?|transaction\s+ids?)\b[:\-\s]*/gim,
        '',
      );
    const candidates = reply
      .split(/[,;\n]+/)
      .map((part) =>
        part
          .replace(
            /^(confirm|confirmed|paid|received|match|matched|ids?|transaction\s+ids?|transaction\s+id)\b[:#\-\s]*/i,
            '',
          )
          .replace(/[.]+$/g, '')
          .trim(),
      )
      .filter(Boolean);

    const ids: string[] = [];
    for (const candidate of candidates) {
      const prefixed = candidate.match(
        /^(confirm|confirmed|paid|received|match|matched|ids?|id|transaction\s+ids?|transaction\s+id)\b[:#\-\s]*(.+)$/i,
      );
      if (candidate.includes(':') && !prefixed) continue;

      const value = prefixed?.[2]?.trim() ?? candidate;
      const compact = this.compactTransactionId(value);
      if (compact.length < 4 || !/\d/.test(compact)) continue;
      ids.push(this.normalizeManualTransactionId(value));
    }
    return this.uniqueManualTransactionIds(ids);
  }

  private extractTopReplyText(text: string) {
    const lines = text.split(/\r?\n/);
    const kept: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^>/.test(trimmed)) continue;
      if (/^on .+ wrote:$/i.test(trimmed)) break;
      if (/^-{2,}\s*original message\s*-{2,}$/i.test(trimmed)) break;
      if (/^from:\s+/i.test(trimmed) && kept.length > 0) break;
      if (/^sent:\s+/i.test(trimmed) && kept.length > 0) break;
      if (
        /a new payment has been submitted for verification in rembeh\./i.test(
          trimmed,
        )
      ) {
        break;
      }
      if (/rembeh payment verification needed/i.test(trimmed)) break;
      if (/^payment request:\s*rembeh-pay:/i.test(trimmed)) break;
      kept.push(line);
    }
    return kept.join('\n').trim();
  }

  private extractPaymentIdFromEmail(input: {
    subject: string | null;
    text: string | null;
    html: string | null;
    to: string[];
    receivedFor?: string[];
  }) {
    const haystack = [
      input.subject,
      input.text,
      input.html ? this.htmlToText(input.html) : null,
      ...(input.to ?? []),
      ...(input.receivedFor ?? []),
    ]
      .filter(Boolean)
      .join('\n');
    const match = haystack.match(
      /REMBEH-PAY:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
    );
    return match?.[1] ?? null;
  }

  private htmlToText(html: string) {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&amp;/gi, '&')
      .replace(/\s+\n/g, '\n')
      .replace(/[ \t]{2,}/g, ' ');
  }

  private toSubscriptionPaymentRow(
    row: SubscriptionPaymentWithBranchPlan,
    options?: { priorPaid?: boolean; useBranchSubscriptionPeriod?: boolean },
  ): SubscriptionPaymentRowContract {
    const paid = row.status === SubscriptionPaymentStatus.COMPLETED;
    const pending = row.status === SubscriptionPaymentStatus.PENDING;
    const cancelled = row.status === SubscriptionPaymentStatus.CANCELLED;
    const failed =
      row.status === SubscriptionPaymentStatus.FAILED ||
      row.status === SubscriptionPaymentStatus.REVERSED;
    const rawActiveFrom = this.payloadString(row.rawPayload, [
      'subscription_active_from',
      'active_from',
      'current_period_start',
      'currentPeriodStart',
    ]);
    const rawActiveFromDate = rawActiveFrom ? new Date(rawActiveFrom) : null;
    const branchPeriodStart = options?.useBranchSubscriptionPeriod
      ? (row.branch.subscription?.currentPeriodStart ?? null)
      : null;
    const periodStart =
      branchPeriodStart ??
      (rawActiveFromDate && !Number.isNaN(rawActiveFromDate.getTime())
        ? rawActiveFromDate
        : (row.paidAt ?? row.createdAt));
    const months = monthsForInterval(row.plan.interval);
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + months);
    const transactionId = this.payloadString(row.rawPayload, [
      'transaction_id',
      'transactionId',
      'TransactionId',
    ]);
    const realActiveUntil = this.payloadString(row.rawPayload, [
      'subscription_active_until',
      'active_until',
      'current_period_end',
      'currentPeriodEnd',
    ]);
    const rawActiveUntilDate = realActiveUntil
      ? new Date(realActiveUntil)
      : null;
    const rawActiveUntilIso =
      rawActiveUntilDate && !Number.isNaN(rawActiveUntilDate.getTime())
        ? rawActiveUntilDate.toISOString()
        : null;
    const branchActiveUntilIso =
      options?.useBranchSubscriptionPeriod &&
      row.branch.subscription?.currentPeriodEnd
        ? row.branch.subscription.currentPeriodEnd.toISOString()
        : null;
    const activeUntil = paid
      ? branchActiveUntilIso || rawActiveUntilIso || periodEnd.toISOString()
      : null;
    const displayPeriodEnd = activeUntil ? new Date(activeUntil) : periodEnd;
    const periodEndForLabel = Number.isNaN(displayPeriodEnd.getTime())
      ? periodEnd
      : displayPeriodEnd;

    return {
      id: row.id,
      date: (row.paidAt ?? row.createdAt).toISOString(),
      branchId: row.branchId,
      branchName: row.branch.name,
      kind: 'subscription',
      transaction: paid
        ? options?.priorPaid
          ? 'Pro renewal'
          : 'Pro subscription'
        : 'Pro subscription',
      periodLabel: paid
        ? `${this.formatShortDate(periodStart)} – ${this.formatShortDate(periodEndForLabel)}`
        : null,
      amount: Number(row.amount),
      currency: row.currency,
      planCode: row.plan.code,
      planDurationMonths: months,
      activeUntil,
      transactionId: transactionId ?? row.orderTrackingId ?? null,
      verifiedAt: paid ? (row.paidAt ?? row.updatedAt).toISOString() : null,
      verifiedByName: paid
        ? this.payloadString(row.rawPayload, [
            'verified_by_name',
            'verifiedByName',
            'verified_by',
            'verifiedBy',
          ])
        : null,
      failureReason: failed
        ? (this.payloadString(row.rawPayload, [
            'failure_reason',
            'failureReason',
            'reason',
          ]) ?? 'Transaction could not be found.')
        : null,
      credits: null,
      paymentMethod: this.paymentMethodFromPayload(row.rawPayload),
      status: paid
        ? 'Paid'
        : failed
          ? 'Failed'
          : cancelled
            ? 'Cancelled'
            : 'Pending',
      receipt: paid
        ? `#${row.merchantReference.slice(-8).toUpperCase()}`
        : null,
      canRetry: failed,
      canCancel: pending && this.isManualMerchantPayload(row.rawPayload),
    };
  }

  private toSmsPurchasePaymentRow(
    row: SmsPurchaseWithBranch,
  ): SubscriptionPaymentRowContract {
    const paid = row.status === SmsPurchaseStatus.CREDITED;
    const pending = this.isPendingManualSmsPurchase(row.status);
    const cancelled = row.status === SmsPurchaseStatus.CANCELLED_BY_USER;
    const failed =
      row.status === SmsPurchaseStatus.PAYMENT_FAILED ||
      row.status === SmsPurchaseStatus.PAYMENT_MISMATCH ||
      row.status === SmsPurchaseStatus.EXPIRED ||
      row.status === SmsPurchaseStatus.REVERSED ||
      cancelled;
    const transactionId =
      this.submittedManualTransactionId(row.rawPayload) ??
      row.externalTransactionId ??
      row.pesapalOrderTrackingId ??
      null;

    return {
      id: row.id,
      date: (row.creditedAt ?? row.createdAt).toISOString(),
      branchId: row.branchId,
      branchName: row.branch.name,
      kind: 'sms',
      transaction: `${row.bundleNameSnapshot} SMS Bundle`,
      periodLabel: `${row.smsUnitsExpected.toLocaleString('en-UG')} SMS`,
      amount: Number(row.amountExpected),
      currency: row.currency,
      planCode: null,
      planDurationMonths: null,
      activeUntil: null,
      transactionId,
      verifiedAt: paid ? (row.creditedAt ?? row.updatedAt).toISOString() : null,
      verifiedByName: null,
      failureReason: failed
        ? (this.payloadString(row.rawPayload, [
            'failure_reason',
            'failureReason',
            'reason',
          ]) ?? 'Transaction could not be found.')
        : null,
      credits: row.smsUnitsExpected,
      paymentMethod: this.paymentMethodFromPayload(row.rawPayload),
      status: paid
        ? 'Paid'
        : failed
          ? cancelled
            ? 'Cancelled'
            : 'Failed'
          : 'Pending',
      receipt: paid
        ? `#${row.merchantReference.slice(-8).toUpperCase()}`
        : null,
      canRetry: failed && !cancelled,
      canCancel: pending && this.isManualMerchantPayload(row.rawPayload),
      bundleId: row.bundleId,
    };
  }

  private normalizeManualTransactionId(value: string) {
    return value.trim().replace(/\s+/g, ' ').toUpperCase();
  }

  private uniqueManualTransactionIds(values: string[]) {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const value of values) {
      const normalized = this.normalizeManualTransactionId(value);
      const compact = this.compactTransactionId(normalized);
      if (!compact || seen.has(compact)) continue;
      seen.add(compact);
      ids.push(normalized);
    }
    return ids;
  }

  private submittedManualTransactionId(raw: Prisma.JsonValue | null) {
    return this.payloadString(raw, [
      'transaction_id',
      'transactionId',
      'TransactionId',
    ]);
  }

  private manualMerchantReference(
    provider: ManualMerchantPaymentProvider,
    transactionId: string,
  ) {
    const digest = createHash('sha256')
      .update(`${provider}:${transactionId}`)
      .digest('hex')
      .slice(0, 24);
    const providerSlug =
      provider === ManualMerchantPaymentProvider.MTN_MOMO ? 'mtn' : 'airtel';
    return `manual_${providerSlug}_${digest}`;
  }

  private manualSmsMerchantReference(
    provider: ManualMerchantPaymentProvider,
    transactionId: string,
  ) {
    const digest = createHash('sha256')
      .update(`sms:${provider}:${transactionId}`)
      .digest('hex')
      .slice(0, 24);
    const providerSlug =
      provider === ManualMerchantPaymentProvider.MTN_MOMO ? 'mtn' : 'airtel';
    return `manual_sms_${providerSlug}_${digest}`;
  }

  private isPendingManualSmsPurchase(status: SmsPurchaseStatus) {
    return new Set<SmsPurchaseStatus>([
      SmsPurchaseStatus.PAYMENT_PENDING,
      SmsPurchaseStatus.AWAITING_PAYMENT,
      SmsPurchaseStatus.PAYMENT_CONFIRMED,
      SmsPurchaseStatus.CREDIT_PROCESSING,
      SmsPurchaseStatus.MANUAL_REVIEW,
    ]).has(status);
  }

  private manualMerchantDetails(provider: ManualMerchantPaymentProvider) {
    if (provider === ManualMerchantPaymentProvider.MTN_MOMO) {
      return {
        historyLabel: 'MTN MoMo',
        merchantCode:
          this.configService.get<string>('MTN_MOMO_MERCHANT_CODE')?.trim() ||
          '123456',
        accountName:
          this.configService.get<string>('MTN_MOMO_ACCOUNT_NAME')?.trim() ||
          'ANTIKRA HOLDINGS LTD',
      };
    }

    if (provider === ManualMerchantPaymentProvider.AIRTEL_MONEY) {
      return {
        historyLabel: 'Airtel Money',
        merchantCode:
          this.configService
            .get<string>('AIRTEL_MONEY_MERCHANT_CODE')
            ?.trim() || '7170321',
        accountName:
          this.configService.get<string>('AIRTEL_MONEY_ACCOUNT_NAME')?.trim() ||
          'ANTIKRA HOLDINGS LTD',
      };
    }

    throw new BadRequestException('Choose a payment method.');
  }

  private payloadString(raw: Prisma.JsonValue | null, keys: string[]) {
    const record = this.payloadObject(raw);
    if (!record) return null;
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
  }

  private payloadObject(raw: Prisma.JsonValue | null) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    return raw as Record<string, unknown>;
  }

  private isManualMerchantPayload(raw: Prisma.JsonValue | null) {
    return this.payloadObject(raw)?.manualMerchant === true;
  }

  private paymentVerificationEmails() {
    const configured = this.configService
      .get<string>('PAYMENT_VERIFICATION_EMAILS')
      ?.split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    return configured && configured.length > 0
      ? configured
      : DEFAULT_PAYMENT_VERIFICATION_EMAILS;
  }

  private paymentVerificationReplyTo() {
    return (
      this.configService.get<string>('PAYMENT_VERIFICATION_REPLY_TO')?.trim() ||
      this.configService.get<string>('RESEND_INBOUND_REPLY_TO')?.trim() ||
      this.configService.get<string>('RESEND_INBOUND_EMAIL')?.trim() ||
      null
    );
  }

  private paymentReplyAllowedEmails() {
    const configured = this.configService
      .get<string>('PAYMENT_VERIFICATION_ALLOWED_REPLY_EMAILS')
      ?.split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const values =
      configured && configured.length > 0
        ? configured
        : this.paymentVerificationEmails();
    return new Set(values);
  }

  private extractEmailAddress(value: string | null | undefined) {
    if (!value) return null;
    const angleMatch = value.match(/<([^>]+)>/);
    const candidate = (angleMatch?.[1] ?? value).trim().toLowerCase();
    const emailMatch = candidate.match(
      /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/i,
    );
    return emailMatch?.[0].toLowerCase() ?? null;
  }

  private compactTransactionId(value: string) {
    return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  private formatPaymentEmailDate(value: Date) {
    const timeZone =
      this.configService
        .get<string>('PAYMENT_VERIFICATION_TIME_ZONE')
        ?.trim() || 'Africa/Kampala';
    const formatted = new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone,
    }).format(value);
    return formatted
      .replace(',', ' at')
      .replace(/\s(am|pm)$/i, (match) => match.toUpperCase());
  }

  private headerValue(value: string | string[] | undefined) {
    if (Array.isArray(value)) return value[0] ?? '';
    return value ?? '';
  }

  private isProduction() {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }

  private paymentMethodFromPayload(raw: Prisma.JsonValue | null): string {
    const record = this.payloadObject(raw);
    if (!record) {
      // No provider payload yet (checkout created, payment not finished).
      return '';
    }
    if (record.manualMerchant === true) {
      if (record.provider === ManualMerchantPaymentProvider.MTN_MOMO) {
        return 'MTN MoMo';
      }
      if (record.provider === ManualMerchantPaymentProvider.AIRTEL_MONEY) {
        return 'Airtel Money';
      }
    }
    const candidates = [
      record.payment_method,
      record.payment_method_type,
      record.PaymentMethod,
      record.payment_account,
      record.channel,
    ]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean);

    if (candidates.length === 0) {
      return '';
    }

    const method = candidates.join(' ').toLowerCase();

    // Mobile money first — never classify as card.
    if (method.includes('airtel')) return 'Airtel Money';
    if (method.includes('mtn') || method.includes('momo')) {
      return 'MTN Mobile Money';
    }
    if (method.includes('mobile money') || method.includes('mobilemoney')) {
      return 'Mobile Money';
    }

    if (method.includes('visa')) return 'Visa Card';
    if (method.includes('master')) return 'Mastercard';
    if (
      /\b(debit|credit)\b/.test(method) ||
      (/\bcard\b/.test(method) && !method.includes('mobile'))
    ) {
      return 'Card';
    }

    // Unknown provider string — surface it as-is rather than guessing.
    return candidates[0];
  }

  private formatShortDate(value: Date) {
    return value.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  private async notifyOwnersBranchNeedsSubscription(input: {
    tenantId: string;
    branchId: string;
    branchName: string;
    kind: SubscriptionOwnerReminderKind;
    daysRemaining?: number | null;
    periodEnd?: Date | null;
    graceEndsAt?: Date | null;
  }) {
    try {
      const [tenant, owners] = await Promise.all([
        this.prisma.tenant.findUnique({
          where: { id: input.tenantId },
          select: { name: true },
        }),
        this.prisma.user.findMany({
          where: {
            tenantId: input.tenantId,
            status: 'ACTIVE',
            roles: {
              some: {
                role: {
                  name: 'Account Owner',
                },
              },
            },
          },
          select: {
            id: true,
            email: true,
            phone: true,
            displayName: true,
          },
        }),
      ]);

      const days = Math.max(0, input.daysRemaining ?? GRACE_DAYS);
      const dayLabel =
        days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'}`;
      const graceWindowLabel = days === 0 ? 'today' : `${dayLabel} left`;
      const periodEndLabel = input.periodEnd
        ? ` on ${this.formatShortDate(input.periodEnd)}`
        : '';
      const graceEndLabel = input.graceEndsAt
        ? ` by ${this.formatShortDate(input.graceEndsAt)}`
        : '';
      const title =
        input.kind === 'locked'
          ? `${input.branchName} is paused`
          : input.kind === 'grace'
            ? `${input.branchName} needs renewing`
            : input.kind === 'trial_ending'
              ? days === 0
                ? `${input.branchName} trial ends today`
                : `${input.branchName} trial ends in ${dayLabel}`
              : days === 0
                ? `${input.branchName} subscription expires today`
                : `${input.branchName} subscription expires in ${dayLabel}`;
      const body =
        input.kind === 'locked'
          ? `${input.branchName} did not renew in time and is now paused. Open Subscription to restore access.`
          : input.kind === 'grace'
            ? `${input.branchName} subscription has expired. You have ${graceWindowLabel} to renew${graceEndLabel} before access is paused.`
            : input.kind === 'trial_ending'
              ? `${input.branchName} trial ends ${
                  days === 0 ? 'today' : `in ${dayLabel}`
                }${periodEndLabel}. Subscribe now so access continues after the trial.`
              : `${input.branchName} subscription expires ${
                  days === 0 ? 'today' : `in ${dayLabel}`
                }${periodEndLabel}. Renew now to keep access uninterrupted.`;

      for (const owner of owners) {
        // Subscription reminders stay automated across SMS, email, and push.
        if (owner.phone) {
          await this.smsService.sendText({
            destination: owner.phone,
            body: `REMBEH: ${body}`,
          });
        }
        if (owner.email) {
          await this.notificationsService.sendSubscriptionReminderEmail({
            destination: owner.email,
            recipientName: owner.displayName || 'there',
            organizationName: tenant?.name ?? 'Your organization',
            branchName: input.branchName,
            kind: input.kind,
            daysRemaining: days,
            periodEnd: input.periodEnd ?? null,
            graceEndsAt: input.graceEndsAt ?? null,
          });
        }
        await this.fcmPushService.sendToUser(input.tenantId, owner.id, {
          title,
          body,
          href: '/owner/subscription',
          data: {
            type: 'billing',
            branchId: input.branchId,
            reminderKind: input.kind,
            daysRemaining: String(days),
          },
        });
      }
    } catch (error) {
      this.logger.warn(
        `Owner billing notify failed for ${input.branchName}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  private toCheckoutHttpException(message: string) {
    const lower = message.toLowerCase();
    if (
      lower.includes('exceeds limit') ||
      lower.includes('amount exceeds') ||
      lower.includes('transaction amount')
    ) {
      return new BadRequestException(
        'This payment couldn’t be completed. Please try again later.',
      );
    }
    return new BadRequestException(
      'We couldn’t start payment. Please try again.',
    );
  }

  private assertCanManage(user: AuthenticatedUser) {
    if (!user.permissions.includes(BILLING_PERMISSIONS.manage)) {
      throw new ForbiddenException(
        'Only the account owner can manage all branch subscriptions.',
      );
    }
  }

  async resolveEffectivePlanPrice(
    tenantId: string,
    branchId: string,
    plan: { id: string; amount: Prisma.Decimal; currency: string },
  ): Promise<{
    amount: Prisma.Decimal;
    currency: string;
    source: 'DEFAULT_PLAN' | 'ORGANIZATION_OVERRIDE' | 'BRANCH_OVERRIDE';
    overrideId: string | null;
  }> {
    const now = new Date();
    const overrides = await this.prisma.subscriptionPriceOverride.findMany({
      where: {
        tenantId,
        planId: plan.id,
        revokedAt: null,
        effectiveFrom: { lte: now },
        AND: [
          {
            OR: [{ branchId }, { branchId: null }],
          },
          {
            OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }],
          },
        ],
      },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });

    const branchOverride = overrides.find((row) => row.branchId === branchId);
    const organizationOverride = overrides.find((row) => row.branchId === null);
    const override = branchOverride ?? organizationOverride;

    return {
      amount: override?.amount ?? plan.amount,
      currency: override?.currency ?? plan.currency,
      source: branchOverride
        ? 'BRANCH_OVERRIDE'
        : organizationOverride
          ? 'ORGANIZATION_OVERRIDE'
          : 'DEFAULT_PLAN',
      overrideId: override?.id ?? null,
    };
  }
}
