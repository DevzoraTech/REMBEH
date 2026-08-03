import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
  forwardRef,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  BranchSubscriptionStatus,
  Prisma,
  SmsPurchaseStatus,
  SubscriptionPaymentStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { PrismaService } from '../../database/prisma.service';
import {
  BillingCheckoutResponseContract,
  BillingSummaryContract,
  BranchBillingStatusContract,
  SubscriptionPaymentRowContract,
} from './billing.contracts';
import {
  BILLING_PERMISSIONS,
  GRACE_DAYS,
  PRO_PLAN_AMOUNT_UGX,
  PRO_PLAN_CODE,
  TRIAL_DAYS,
} from './billing.permissions';
import { PesapalClient } from './pesapal.client';
import { ConfigService } from '@nestjs/config';
import { SmsService } from '../notifications/sms.service';
import { FcmPushService } from '../notifications/fcm-push.service';
import { SmsCreditsService } from '../sms-credits/sms-credits.service';

@Injectable()
export class BillingService implements OnModuleInit {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pesapal: PesapalClient,
    private readonly configService: ConfigService,
    private readonly smsService: SmsService,
    private readonly fcmPushService: FcmPushService,
    @Inject(forwardRef(() => SmsCreditsService))
    private readonly smsCreditsService: SmsCreditsService,
  ) {}

  async onModuleInit() {
    try {
      await this.ensureProPlan();
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
    const plan = await this.ensureProPlan();
    const planAmount = Number(plan.amount);
    const planCurrency = plan.currency || 'UGX';

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

    const billing = await this.ensureTenantBilling(user.tenantId);
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
    const trialActive = billing.trialEndsAt.getTime() > now;
    const trialDaysRemaining = trialActive
      ? Math.max(
          0,
          Math.ceil(
            (billing.trialEndsAt.getTime() - now) / (24 * 60 * 60 * 1000),
          ),
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
      trialEndsAt: billing.trialEndsAt.toISOString(),
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
          include: {
            branch: { select: { name: true } },
            plan: { select: { name: true } },
          },
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

    const subscriptionPayments: SubscriptionPaymentRowContract[] =
      subscriptionRows.map((row) => {
        const paid = row.status === SubscriptionPaymentStatus.COMPLETED;
        const failed = row.status === SubscriptionPaymentStatus.FAILED;
        const periodStart = row.paidAt ?? row.createdAt;
        const periodEnd = new Date(
          periodStart.getTime() + 30 * 24 * 60 * 60 * 1000,
        );
        const priorPaid = subscriptionRows.some(
          (other) =>
            other.branchId === row.branchId &&
            other.id !== row.id &&
            other.status === SubscriptionPaymentStatus.COMPLETED &&
            other.createdAt < row.createdAt,
        );
        return {
          id: row.id,
          date: (row.paidAt ?? row.createdAt).toISOString(),
          branchId: row.branchId,
          branchName: row.branch.name,
          kind: 'subscription' as const,
          transaction: paid
            ? priorPaid
              ? 'Pro renewal'
              : 'Pro subscription'
            : 'Pro subscription',
          periodLabel: paid
            ? `${this.formatShortDate(periodStart)} – ${this.formatShortDate(periodEnd)}`
            : null,
          amount: Number(row.amount),
          currency: row.currency,
          credits: null,
          paymentMethod: this.paymentMethodFromPayload(row.rawPayload),
          status: paid ? 'Paid' : failed ? 'Failed' : 'Pending',
          receipt: paid
            ? `#${row.merchantReference.slice(-8).toUpperCase()}`
            : null,
          canRetry: failed,
        };
      });

    const smsPurchasePayments: SubscriptionPaymentRowContract[] =
      smsPurchaseRows.map((row) => {
        const paid = row.status === SmsPurchaseStatus.CREDITED;
        const failed =
          row.status === SmsPurchaseStatus.PAYMENT_FAILED ||
          row.status === SmsPurchaseStatus.PAYMENT_MISMATCH ||
          row.status === SmsPurchaseStatus.EXPIRED ||
          row.status === SmsPurchaseStatus.CANCELLED_BY_USER;
        return {
          id: row.id,
          date: (row.creditedAt ?? row.createdAt).toISOString(),
          branchId: row.branchId,
          branchName: row.branch.name,
          kind: 'sms' as const,
          transaction: row.bundleNameSnapshot,
          periodLabel: `${row.smsUnitsExpected.toLocaleString('en-UG')} SMS`,
          amount: row.amountExpected,
          currency: row.currency,
          credits: row.smsUnitsExpected,
          paymentMethod: this.paymentMethodFromPayload(row.rawPayload),
          status: paid ? 'Paid' : failed ? 'Failed' : 'Pending',
          receipt: paid
            ? `#${row.merchantReference.slice(-8).toUpperCase()}`
            : null,
          canRetry: failed,
          bundleId: row.bundleId,
        };
      });

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

  async ensureProPlan() {
    const existing = await this.prisma.subscriptionPlan.findUnique({
      where: { code: PRO_PLAN_CODE },
    });
    if (existing) {
      const amount = Number(existing.amount);
      if (amount !== PRO_PLAN_AMOUNT_UGX || !existing.isActive) {
        return this.prisma.subscriptionPlan.update({
          where: { id: existing.id },
          data: {
            amount: new Prisma.Decimal(PRO_PLAN_AMOUNT_UGX),
            currency: 'UGX',
            interval: 'MONTHLY',
            isActive: true,
            name: 'Pro',
          },
        });
      }
      return existing;
    }

    return this.prisma.subscriptionPlan.create({
      data: {
        code: PRO_PLAN_CODE,
        name: 'Pro',
        amount: new Prisma.Decimal(PRO_PLAN_AMOUNT_UGX),
        currency: 'UGX',
        interval: 'MONTHLY',
        isActive: true,
      },
    });
  }

  async provisionBranchSubscription(input: {
    tenantId: string;
    branchId: string;
  }) {
    const billing = await this.ensureTenantBilling(input.tenantId);
    const plan = await this.ensureProPlan();
    const existing = await this.prisma.branchSubscription.findUnique({
      where: { branchId: input.branchId },
    });
    if (existing) return existing;

    const now = new Date();
    const inTrial = billing.trialEndsAt.getTime() > now.getTime();

    if (inTrial) {
      return this.prisma.branchSubscription.create({
        data: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          planId: plan.id,
          status: BranchSubscriptionStatus.TRIAL,
          currentPeriodStart: billing.trialStartsAt,
          currentPeriodEnd: billing.trialEndsAt,
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
    const plan = await this.ensureProPlan();
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
      include: { subscription: true },
    });

    const now = Date.now();
    const trialActive = billing.trialEndsAt.getTime() > now;
    const daysRemaining = Math.max(
      0,
      Math.ceil((billing.trialEndsAt.getTime() - now) / (24 * 60 * 60 * 1000)),
    );

    const reminders: string[] = [];
    const rows = refreshed.map((branch) => {
      const sub = branch.subscription!;
      const reminder = this.reminderFor(sub, branch.name);
      if (reminder) reminders.push(reminder);
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
      };
    });

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

    return {
      plan: {
        code: plan.code,
        name: plan.name,
        amount: Number(plan.amount),
        currency: plan.currency,
        interval: plan.interval,
      },
      trial: {
        active: trialActive,
        startsAt: billing.trialStartsAt.toISOString(),
        endsAt: billing.trialEndsAt.toISOString(),
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
    const plan = await this.ensureProPlan();
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

    const payment = await this.prisma.subscriptionPayment.create({
      data: {
        tenantId: user.tenantId,
        branchId: branch.id,
        planId: plan.id,
        merchantReference,
        amount: plan.amount,
        currency: plan.currency,
        status: SubscriptionPaymentStatus.PENDING,
      },
    });

    const nameParts = (payer?.displayName || user.displayName || 'REMBEH').split(
      /\s+/,
    );

    const webAppUrl =
      this.configService.get<string>('WEB_APP_URL')?.trim() ||
      'https://rembeh.antikra.com';

    let order;
    try {
      order = await this.pesapal.submitOrder({
        id: merchantReference,
        currency: plan.currency,
        amount: Number(plan.amount),
        description: `REMBEH Pro — ${branch.name}`.slice(0, 100),
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
        error instanceof Error ? error.message : 'Payment could not be started.';
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
        rawPayload: order as Prisma.InputJsonValue,
      },
    });

    return {
      redirectUrl: order.redirect_url,
      merchantReference,
      orderTrackingId: order.order_tracking_id ?? null,
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

    const webAppUrl =
      this.configService.get<string>('WEB_APP_URL')?.trim() ||
      'https://rembeh.antikra.com';

    if (smsBranchId) {
      const params = new URLSearchParams({ smsPaid: '1', branch: smsBranchId });
      return `${webAppUrl}/subscription?${params.toString()}`;
    }

    const payment = trackingId
      ? await this.prisma.subscriptionPayment.findFirst({
          where: { orderTrackingId: trackingId },
        })
      : null;

    const params = new URLSearchParams({ paid: '1' });
    if (payment?.branchId) params.set('branch', payment.branchId);
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
    const billing = await this.ensureTenantBilling(tenantId);
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

      const trialActive = billing.trialEndsAt.getTime() > now.getTime();

      if (trialActive) {
        if (sub.status !== BranchSubscriptionStatus.TRIAL) {
          // Keep ACTIVE paid periods even during leftover trial window overlaps.
          if (sub.status === BranchSubscriptionStatus.ACTIVE) continue;
        } else {
          await this.prisma.branchSubscription.update({
            where: { id: sub.id },
            data: {
              status: BranchSubscriptionStatus.TRIAL,
              currentPeriodStart: billing.trialStartsAt,
              currentPeriodEnd: billing.trialEndsAt,
              graceEndsAt: null,
              lockedAt: null,
              planId: plan.id,
            },
          });
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
            currentPeriodEnd: billing.trialEndsAt,
            lastReminderAt: now,
          },
        });
        void this.notifyOwnersBranchNeedsSubscription({
          tenantId,
          branchId: branch.id,
          branchName: branch.name,
          kind: 'grace',
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
        });
        continue;
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

    const description = (
      status.payment_status_description || ''
    ).toLowerCase();
    // Pesapal status_code: 0 INVALID, 1 COMPLETED, 2 FAILED, 3 REVERSED
    const statusCode = Number(
      (status as { status_code?: number | string }).status_code ??
        status.payment_status_code ??
        NaN,
    );
    const completed =
      statusCode === 1 || description.includes('completed');

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
    const base =
      sub?.currentPeriodEnd && sub.currentPeriodEnd.getTime() > now.getTime()
        ? sub.currentPeriodEnd
        : now;
    const periodEnd = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);

    await this.prisma.$transaction(async (tx) => {
      await tx.subscriptionPayment.update({
        where: { id: payment.id },
        data: {
          status: SubscriptionPaymentStatus.COMPLETED,
          orderTrackingId,
          paidAt: now,
          rawPayload: status as Prisma.InputJsonValue,
        },
      });

      await tx.branchSubscription.update({
        where: { branchId: payment.branchId },
        data: {
          status: BranchSubscriptionStatus.ACTIVE,
          currentPeriodStart: now,
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
            Math.ceil(
              (sub.graceEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
            ),
          )
        : GRACE_DAYS;
      return `${branchName} needs renewing within ${days} day${days === 1 ? '' : 's'} to stay open.`;
    }
    if (sub.status === BranchSubscriptionStatus.LOCKED) {
      return `${branchName} is paused — renew to continue.`;
    }
    if (
      sub.status === BranchSubscriptionStatus.ACTIVE &&
      sub.currentPeriodEnd
    ) {
      const days = Math.ceil(
        (sub.currentPeriodEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
      );
      if (days <= 3 && days >= 0) {
        return `${branchName} renews in ${days} day${days === 1 ? '' : 's'}.`;
      }
    }
    return null;
  }

  private paymentMethodFromPayload(raw: Prisma.JsonValue | null): string {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      // No provider payload yet (checkout created, payment not finished).
      return '';
    }
    const record = raw as Record<string, unknown>;
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
    kind: 'grace' | 'locked';
  }) {
    try {
      const owners = await this.prisma.user.findMany({
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
          phone: true,
          displayName: true,
        },
      });

      const title =
        input.kind === 'locked'
          ? `${input.branchName} is paused`
          : `${input.branchName} needs renewing`;
      const body =
        input.kind === 'locked'
          ? `${input.branchName} did not renew in time and is now locked. Open Subscription to restore access.`
          : `${input.branchName} subscription expired. Renew within ${GRACE_DAYS} days to keep the branch open.`;

      for (const owner of owners) {
        // Subscription reminders stay automated (SMS + in-app push).
        if (owner.phone) {
          await this.smsService.sendText({
            destination: owner.phone,
            body: `REMBEH: ${body}`,
          });
        }
        await this.fcmPushService.sendToUser(input.tenantId, owner.id, {
          title,
          body,
          href: '/owner/subscription',
          data: {
            type: 'billing',
            branchId: input.branchId,
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
}
