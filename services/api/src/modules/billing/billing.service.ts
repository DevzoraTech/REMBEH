import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  BranchSubscriptionStatus,
  Prisma,
  SubscriptionPaymentStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { PrismaService } from '../../database/prisma.service';
import {
  BillingCheckoutResponseContract,
  BillingSummaryContract,
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

@Injectable()
export class BillingService implements OnModuleInit {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pesapal: PesapalClient,
    private readonly configService: ConfigService,
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

  async getMyBranchStatus(user: AuthenticatedUser) {
    if (!user.branchId) {
      return {
        branchId: null as string | null,
        status: null as string | null,
        locked: false,
        message: null as string | null,
      };
    }

    await this.ensureTenantBilling(user.tenantId);
    await this.syncTenantSubscriptions(user.tenantId);
    let sub = await this.prisma.branchSubscription.findUnique({
      where: { branchId: user.branchId },
    });
    if (!sub) {
      sub = await this.provisionBranchSubscription({
        tenantId: user.tenantId,
        branchId: user.branchId,
      });
    }

    const locked = sub.status === BranchSubscriptionStatus.LOCKED;
    return {
      branchId: user.branchId,
      status: sub.status,
      locked,
      graceEndsAt: sub.graceEndsAt?.toISOString() ?? null,
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
      message: locked
        ? 'This branch is paused. Renew on Subscription to continue.'
        : sub.status === BranchSubscriptionStatus.GRACE
          ? 'Renew soon to keep this branch open.'
          : null,
    };
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
    if (existing) return existing;

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
        'You need a branch assignment to view subscription.',
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
      throw new ForbiddenException(
        'You can only pay for your own branch.',
      );
    }
    if (!canManageAll && !user.branchId) {
      throw new ForbiddenException(
        'You need a branch assignment to pay.',
      );
    }

    if (!this.pesapal.isConfigured()) {
      throw new ServiceUnavailableException(
        'Payments are not available right now. Try again later.',
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
      throw new BadRequestException(
        'Payment return URL is not configured.',
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

    let order;
    try {
      order = await this.pesapal.submitOrder({
        id: merchantReference,
        currency: plan.currency,
        amount: Number(plan.amount),
        description: `REMBEH Pro — ${branch.name}`,
        callbackUrl: `${apiCallback}?branchId=${branch.id}`,
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
      this.logger.error(`Pesapal checkout failed: ${message}`);
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
        'Payment page is unavailable right now. Please try again.',
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
    if (trackingId) {
      await this.finalizePesapalPayment(trackingId);
    }

    const webAppUrl =
      this.configService.get<string>('WEB_APP_URL')?.trim() ||
      'https://rembeh.antikra.com';
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
          },
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
      this.logger.warn(`No subscription payment for tracking ${orderTrackingId}`);
      return;
    }

    const description = (
      status.payment_status_description || ''
    ).toLowerCase();
    const code = String(status.payment_status_code ?? '');
    const completed =
      description.includes('completed') ||
      description === 'success' ||
      code === '1' ||
      code === '0';

    if (!completed) {
      await this.prisma.subscriptionPayment.update({
        where: { id: payment.id },
        data: {
          orderTrackingId,
          rawPayload: status as Prisma.InputJsonValue,
          status:
            description.includes('failed') || description.includes('invalid')
              ? SubscriptionPaymentStatus.FAILED
              : SubscriptionPaymentStatus.PENDING,
        },
      });
      return;
    }

    if (payment.status === SubscriptionPaymentStatus.COMPLETED) {
      return;
    }

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

  private toCheckoutHttpException(message: string) {
    const lower = message.toLowerCase();
    if (
      lower.includes('exceeds limit') ||
      lower.includes('amount exceeds') ||
      lower.includes('transaction amount')
    ) {
      return new BadRequestException(
        'Pesapal declined UGX 150,000 for this merchant account. Ask Pesapal support to raise your transaction limit, then try again.',
      );
    }
    if (lower.includes('not configured') || lower.includes('auth failed')) {
      return new ServiceUnavailableException(
        'Payments are not available right now. Please try again later.',
      );
    }
    return new BadRequestException(
      message.length > 180
        ? 'Payment could not be started. Please try again or contact support.'
        : message,
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
