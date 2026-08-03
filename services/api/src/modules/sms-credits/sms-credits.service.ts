import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, SubscriptionPaymentStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { isPrismaUniqueConstraintError } from '../../common/database/prisma-errors';
import { PrismaService } from '../../database/prisma.service';
import { BILLING_PERMISSIONS } from '../billing/billing.permissions';
import { PesapalClient } from '../billing/pesapal.client';
import { SmsService } from '../notifications/sms.service';
import {
  BRANCH_SMS_TOP_UP_PRESETS_UGX,
  BRANCH_SMS_UNIT_PRICE_UGX,
  PRO_PLAN_WELCOME_SMS_CREDITS,
  creditsForTopUpAmount,
} from './sms-credits.constants';
import type {
  SmsBalanceContract,
  SmsTopUpCheckoutContract,
  SmsWalletContract,
} from './sms-credits.contracts';

@Injectable()
export class SmsCreditsService {
  private readonly logger = new Logger(SmsCreditsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly pesapal: PesapalClient,
    private readonly smsService: SmsService,
  ) {}

  async getWallet(
    user: AuthenticatedUser,
    branchId?: string,
  ): Promise<SmsWalletContract> {
    const branch = await this.resolveBranch(user, branchId);
    const wallet = await this.ensureWallet(user.tenantId, branch.id);
    return this.toWalletContract(branch.id, branch.name, wallet.creditsRemaining);
  }

  /**
   * Remaining SMS for header chrome.
   * Managers: own branch. Owners: sum across all branch wallets.
   */
  async getBalance(user: AuthenticatedUser): Promise<SmsBalanceContract> {
    if (!user.tenantId?.trim()) {
      throw new ForbiddenException('Account access is required.');
    }

    if (user.branchId?.trim()) {
      const branch = await this.resolveBranch(user, user.branchId);
      const wallet = await this.ensureWallet(user.tenantId, branch.id);
      return {
        creditsRemaining: wallet.creditsRemaining,
        canSendSms: wallet.creditsRemaining > 0,
        scope: 'branch',
        branchId: branch.id,
        branchName: branch.name,
      };
    }

    if (!user.permissions.includes(BILLING_PERMISSIONS.manage)) {
      throw new ForbiddenException(
        'You can only view SMS credits for your own branch.',
      );
    }

    const wallets = await this.prisma.branchSmsWallet.findMany({
      where: { tenantId: user.tenantId },
      select: { creditsRemaining: true },
    });
    const creditsRemaining = wallets.reduce(
      (sum, row) => sum + row.creditsRemaining,
      0,
    );

    return {
      creditsRemaining,
      canSendSms: creditsRemaining > 0,
      scope: 'account',
      branchId: null,
      branchName: null,
    };
  }

  async startTopUp(
    user: AuthenticatedUser,
    branchId: string,
    amountUgx: number,
  ): Promise<SmsTopUpCheckoutContract> {
    const amount = Math.round(Number(amountUgx));
    if (!Number.isFinite(amount) || amount < BRANCH_SMS_UNIT_PRICE_UGX) {
      throw new BadRequestException(
        `Minimum SMS top-up is UGX ${BRANCH_SMS_UNIT_PRICE_UGX.toLocaleString('en-UG')}.`,
      );
    }

    const credits = creditsForTopUpAmount(amount);
    if (credits < 1) {
      throw new BadRequestException('Top-up amount is too low for any SMS credits.');
    }

    if (!this.pesapal.isConfigured()) {
      throw new ServiceUnavailableException(
        'Payments are unavailable right now. Please try again later.',
      );
    }

    const branch = await this.resolveBranch(user, branchId);
    const wallet = await this.ensureWallet(user.tenantId, branch.id);

    const payer = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { email: true, phone: true, displayName: true },
    });

    const merchantReference = `sms_${branch.id.slice(0, 8)}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const apiCallback =
      this.configService.get<string>('PESAPAL_CALLBACK_URL')?.trim() ||
      `${this.configService.get<string>('API_PUBLIC_URL')?.trim() || ''}/api/v1/billing/pesapal/callback`;

    if (!apiCallback) {
      throw new ServiceUnavailableException(
        'Payments are unavailable right now. Please try again later.',
      );
    }

    const payment = await this.prisma.smsCreditPayment.create({
      data: {
        tenantId: user.tenantId,
        branchId: branch.id,
        walletId: wallet.id,
        merchantReference,
        amount,
        currency: 'UGX',
        credits,
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
        currency: 'UGX',
        amount,
        description: `REMBEH SMS credits — ${branch.name}`.slice(0, 100),
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
      this.logger.error(`SMS top-up checkout failed: ${message}`);
      await this.prisma.smsCreditPayment.update({
        where: { id: payment.id },
        data: { status: SubscriptionPaymentStatus.FAILED },
      });
      throw new BadRequestException(
        'We couldn’t start payment. Please try again.',
      );
    }

    if (!order.redirect_url) {
      await this.prisma.smsCreditPayment.update({
        where: { id: payment.id },
        data: { status: SubscriptionPaymentStatus.FAILED },
      });
      throw new ServiceUnavailableException(
        'Payments are unavailable right now. Please try again later.',
      );
    }

    await this.prisma.smsCreditPayment.update({
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
      amountUgx: amount,
      credits,
    };
  }

  /** Called from Pesapal IPN/callback when tracking id matches an SMS top-up. */
  async finalizeIfSmsPayment(orderTrackingId: string): Promise<boolean> {
    let payment = await this.prisma.smsCreditPayment.findFirst({
      where: { orderTrackingId },
    });
    const status = await this.pesapal.getTransactionStatus(orderTrackingId);
    if (!payment && status.merchant_reference) {
      payment = await this.prisma.smsCreditPayment.findFirst({
        where: { merchantReference: status.merchant_reference },
      });
    }
    if (!payment) return false;

    const description = (
      status.payment_status_description || ''
    ).toLowerCase();
    const statusCode = Number(
      (status as { status_code?: number | string }).status_code ??
        status.payment_status_code ??
        NaN,
    );
    const completed =
      statusCode === 1 || description.includes('completed');

    if (!completed) {
      await this.prisma.smsCreditPayment.update({
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
      return true;
    }

    if (payment.status === SubscriptionPaymentStatus.COMPLETED) {
      return true;
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.smsCreditPayment.update({
        where: { id: payment.id },
        data: {
          status: SubscriptionPaymentStatus.COMPLETED,
          orderTrackingId,
          paidAt: now,
          rawPayload: status as Prisma.InputJsonValue,
        },
      });
      await tx.branchSmsWallet.update({
        where: { id: payment.walletId },
        data: {
          creditsRemaining: { increment: payment.credits },
          lifetimePurchased: { increment: payment.credits },
        },
      });
    });

    this.logger.log(
      `SMS credits +${payment.credits} for branch ${payment.branchId}`,
    );
    return true;
  }

  async findCompletedSmsBranchId(
    orderTrackingId: string,
  ): Promise<string | null> {
    const row = await this.prisma.smsCreditPayment.findFirst({
      where: {
        orderTrackingId,
        status: SubscriptionPaymentStatus.COMPLETED,
      },
      select: { branchId: true },
    });
    return row?.branchId ?? null;
  }

  /**
   * One-time Pro welcome pack: 140 SMS credits on a branch's first completed
   * plan purchase. Idempotent via a unique welcome payment row per branch.
   */
  async grantProWelcomeSmsCredits(input: {
    tenantId: string;
    branchId: string;
  }): Promise<{ granted: boolean; credits: number }> {
    const merchantReference = `pro_welcome_${input.branchId.replaceAll('-', '')}`;
    const existing = await this.prisma.smsCreditPayment.findUnique({
      where: { merchantReference },
      select: { id: true, status: true },
    });
    if (existing?.status === SubscriptionPaymentStatus.COMPLETED) {
      return { granted: false, credits: 0 };
    }

    const wallet = await this.ensureWallet(input.tenantId, input.branchId);
    const credits = PRO_PLAN_WELCOME_SMS_CREDITS;
    const now = new Date();

    try {
      await this.prisma.$transaction(async (tx) => {
        if (existing) {
          await tx.smsCreditPayment.update({
            where: { id: existing.id },
            data: {
              status: SubscriptionPaymentStatus.COMPLETED,
              credits,
              paidAt: now,
            },
          });
        } else {
          await tx.smsCreditPayment.create({
            data: {
              tenantId: input.tenantId,
              branchId: input.branchId,
              walletId: wallet.id,
              merchantReference,
              amount: 0,
              currency: 'UGX',
              credits,
              status: SubscriptionPaymentStatus.COMPLETED,
              paidAt: now,
            },
          });
        }
        await tx.branchSmsWallet.update({
          where: { id: wallet.id },
          data: {
            creditsRemaining: { increment: credits },
            lifetimePurchased: { increment: credits },
          },
        });
      });
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        return { granted: false, credits: 0 };
      }
      throw error;
    }

    this.logger.log(
      `Pro welcome SMS +${credits} for branch ${input.branchId}`,
    );
    return { granted: true, credits };
  }

  /**
   * Debit one branch SMS credit and send.
   * Never sends when the branch has no credit left (returns sent: false).
   * Platform SMS (OTP, billing reminders) must use SmsService.sendText directly.
   */
  async sendBranchSms(input: {
    tenantId: string;
    branchId: string;
    destination: string;
    body: string;
    purpose: string;
  }): Promise<{ sent: boolean; reason?: string }> {
    const wallet = await this.ensureWallet(input.tenantId, input.branchId);
    if (wallet.creditsRemaining < 1) {
      this.logger.log(
        `SMS skipped (no credits) branch=${input.branchId} purpose=${input.purpose}`,
      );
      return { sent: false, reason: 'no_credits' };
    }

    const debited = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.branchSmsWallet.updateMany({
        where: {
          id: wallet.id,
          creditsRemaining: { gte: 1 },
        },
        data: {
          creditsRemaining: { decrement: 1 },
          lifetimeUsed: { increment: 1 },
        },
      });
      if (updated.count !== 1) return false;
      await tx.smsUsageLog.create({
        data: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          walletId: wallet.id,
          purpose: input.purpose,
          destination: input.destination,
          bodyPreview: input.body.slice(0, 160),
        },
      });
      return true;
    });

    if (!debited) {
      return { sent: false, reason: 'no_credits' };
    }

    const result = await this.smsService.sendText({
      destination: input.destination,
      body: input.body,
    });

    if (!result.delivered) {
      // Refund credit when provider fails so the branch is not charged.
      await this.prisma.branchSmsWallet.update({
        where: { id: wallet.id },
        data: {
          creditsRemaining: { increment: 1 },
          lifetimeUsed: { decrement: 1 },
        },
      });
      this.logger.warn(
        `SMS provider failed; credit refunded branch=${input.branchId}`,
      );
      return { sent: false, reason: 'provider_failed' };
    }

    return { sent: true };
  }

  private async ensureWallet(tenantId: string, branchId: string) {
    const existing = await this.prisma.branchSmsWallet.findUnique({
      where: { branchId },
    });
    if (existing) return existing;
    return this.prisma.branchSmsWallet.create({
      data: {
        tenantId,
        branchId,
        creditsRemaining: 0,
      },
    });
  }

  private async resolveBranch(user: AuthenticatedUser, branchId?: string) {
    if (!user.tenantId?.trim()) {
      throw new ForbiddenException('Account access is required.');
    }

    const canManageAll = user.permissions.includes(BILLING_PERMISSIONS.manage);
    const targetId = branchId?.trim() || user.branchId || '';

    if (!targetId) {
      throw new BadRequestException('Choose a branch for SMS credits.');
    }

    if (!canManageAll && user.branchId !== targetId) {
      throw new ForbiddenException(
        'You can only manage SMS credits for your own branch.',
      );
    }

    const branch = await this.prisma.branch.findFirst({
      where: { id: targetId, tenantId: user.tenantId },
      select: { id: true, name: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found.');
    }
    return branch;
  }

  private toWalletContract(
    branchId: string,
    branchName: string,
    creditsRemaining: number,
  ): SmsWalletContract {
    return {
      branchId,
      branchName,
      creditsRemaining,
      canSendSms: creditsRemaining > 0,
      topUpPresets: BRANCH_SMS_TOP_UP_PRESETS_UGX.map((amountUgx) => ({
        amountUgx,
        currency: 'UGX',
        credits: creditsForTopUpAmount(amountUgx),
      })),
    };
  }
}
