import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  Prisma,
  SmsBundleStatus,
  SmsCallbackProcessingStatus,
  SmsDeliveryStatus,
  SmsMessageStatus,
  SmsPurchaseStatus,
  SmsWalletLedgerDirection,
  SmsWalletLedgerEntryType,
  SubscriptionPaymentStatus,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { isPrismaUniqueConstraintError } from '../../common/database/prisma-errors';
import { PrismaService } from '../../database/prisma.service';
import { BILLING_PERMISSIONS } from '../billing/billing.permissions';
import { PesapalClient } from '../billing/pesapal.client';
import { FcmPushService } from '../notifications/fcm-push.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SmsService } from '../notifications/sms.service';
import type { SmsProviderRequestLogPayload } from '../notifications/sms.service';
import {
  PRO_PLAN_WELCOME_SMS_CREDITS,
  SMS_PURCHASE_DUPLICATE_WINDOW_MS,
  SMS_PURCHASE_EXPIRES_MS,
  SMS_RESERVED_STALE_TTL_MS,
  SMS_RETRYABLE_STATUSES,
  SMS_UNCERTAIN_RESERVATION_TTL_MS,
  SMS_WELCOME_GRANT_REFERENCE_TYPE,
} from './sms-credits.constants';
import type {
  SmsBalanceContract,
  SmsBundleContract,
  SmsDispatchResult,
  SmsLedgerEntryContract,
  SmsPurchaseCheckoutContract,
  SmsWalletContract,
} from './sms-credits.contracts';
import { analyzeSmsBody, normalizeUgPhoneTo256 } from './sms-segments';

type TxClient = Prisma.TransactionClient;

@Injectable()
export class SmsCreditsService {
  private readonly logger = new Logger(SmsCreditsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly pesapal: PesapalClient,
    private readonly smsService: SmsService,
    private readonly notificationsService: NotificationsService,
    private readonly fcmPushService: FcmPushService,
  ) {}

  async listBundles(): Promise<{ bundles: SmsBundleContract[] }> {
    const now = new Date();
    const rows = await this.prisma.smsBundle.findMany({
      where: {
        status: SmsBundleStatus.ACTIVE,
        activeFrom: { lte: now },
        OR: [{ activeTo: null }, { activeTo: { gt: now } }],
      },
      orderBy: { priceUgx: 'asc' },
    });
    return {
      bundles: rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        priceUgx: row.priceUgx,
        smsUnits: row.smsUnits,
        currency: 'UGX' as const,
        version: row.version,
      })),
    };
  }

  async getWallet(
    user: AuthenticatedUser,
    branchId?: string,
  ): Promise<SmsWalletContract> {
    const branch = await this.resolveBranch(user, branchId);
    const wallet = await this.ensureWallet(user.tenantId, branch.id);
    await this.expireStalePurchasesForBranch(branch.id);
    return this.toWalletContract(branch.id, branch.name, wallet);
  }

  /**
   * Remaining SMS for header chrome.
   * Managers: own branch. Owners: sum of available across all branch wallets.
   */
  async getBalance(user: AuthenticatedUser): Promise<SmsBalanceContract> {
    if (!user.tenantId?.trim()) {
      throw new ForbiddenException('Account access is required.');
    }

    if (user.branchId?.trim()) {
      const branch = await this.resolveBranch(user, user.branchId);
      const wallet = await this.ensureWallet(user.tenantId, branch.id);
      return {
        availableUnits: wallet.availableUnits,
        reservedUnits: wallet.reservedUnits,
        creditsRemaining: wallet.availableUnits,
        canSendSms: wallet.availableUnits > 0,
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
      select: { availableUnits: true, reservedUnits: true },
    });
    const availableUnits = wallets.reduce(
      (sum, row) => sum + row.availableUnits,
      0,
    );
    const reservedUnits = wallets.reduce(
      (sum, row) => sum + row.reservedUnits,
      0,
    );

    return {
      availableUnits,
      reservedUnits,
      creditsRemaining: availableUnits,
      canSendSms: availableUnits > 0,
      scope: 'account',
      branchId: null,
      branchName: null,
    };
  }

  async listLedger(
    user: AuthenticatedUser,
    branchId?: string,
  ): Promise<{ entries: SmsLedgerEntryContract[] }> {
    const branch = await this.resolveBranch(user, branchId);
    const entries = await this.prisma.smsWalletLedger.findMany({
      where: { tenantId: user.tenantId, branchId: branch.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      entries: entries.map((row) => ({
        id: row.id,
        entryType: row.entryType,
        direction: row.direction,
        units: row.units,
        balanceBefore: row.balanceBefore,
        balanceAfter: row.balanceAfter,
        description: row.description,
        referenceType: row.referenceType,
        referenceId: row.referenceId,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  /** Catalogue purchase — body is bundleId (+ optional branchId) only. */
  async startPurchase(
    user: AuthenticatedUser,
    input: { bundleId: string; branchId?: string },
  ): Promise<SmsPurchaseCheckoutContract> {
    const bundleId = input.bundleId?.trim();
    if (!bundleId) {
      throw new BadRequestException('Choose an SMS bundle to continue.');
    }

    if (!this.pesapal.isConfigured()) {
      throw new ServiceUnavailableException(
        'Payments are unavailable right now. Please try again later.',
      );
    }

    const branch = await this.resolveBranch(user, input.branchId);
    await this.expireStalePurchasesForBranch(branch.id);

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

    const duplicateSince = new Date(
      now.getTime() - SMS_PURCHASE_DUPLICATE_WINDOW_MS,
    );
    const existingPending = await this.prisma.smsPurchase.findFirst({
      where: {
        branchId: branch.id,
        bundleId: bundle.id,
        initiatedByUserId: user.userId,
        status: {
          in: [
            SmsPurchaseStatus.PAYMENT_PENDING,
            SmsPurchaseStatus.AWAITING_PAYMENT,
          ],
        },
        expiresAt: { gt: now },
        createdAt: { gte: duplicateSince },
        pesapalOrderTrackingId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingPending?.pesapalOrderTrackingId) {
      const raw = existingPending.rawPayload as
        | { redirect_url?: string }
        | null
        | undefined;
      if (raw?.redirect_url) {
        return {
          redirectUrl: raw.redirect_url,
          purchaseId: existingPending.id,
          merchantReference: existingPending.merchantReference,
          orderTrackingId: existingPending.pesapalOrderTrackingId,
          bundleId: bundle.id,
          bundleName: existingPending.bundleNameSnapshot,
          amountUgx: existingPending.amountExpected,
          smsUnits: existingPending.smsUnitsExpected,
          currency: 'UGX',
          status: existingPending.status,
        };
      }
    }

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

    const expiresAt = new Date(now.getTime() + SMS_PURCHASE_EXPIRES_MS);
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
        status: SmsPurchaseStatus.PAYMENT_PENDING,
        expiresAt,
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
        amount: bundle.priceUgx,
        description: `REMBEH SMS — ${bundle.name} (${branch.name})`.slice(
          0,
          100,
        ),
        callbackUrl: apiCallback,
        cancellationUrl: `${webAppUrl}/subscription?tab=sms`,
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
      this.logger.error(`SMS purchase checkout failed: ${message}`);
      await this.prisma.smsPurchase.update({
        where: { id: purchase.id },
        data: { status: SmsPurchaseStatus.PAYMENT_FAILED },
      });
      throw new BadRequestException(
        'We couldn’t start payment. Please try again.',
      );
    }

    if (!order.redirect_url) {
      await this.prisma.smsPurchase.update({
        where: { id: purchase.id },
        data: { status: SmsPurchaseStatus.PAYMENT_FAILED },
      });
      throw new ServiceUnavailableException(
        'Payments are unavailable right now. Please try again later.',
      );
    }

    const updated = await this.prisma.smsPurchase.update({
      where: { id: purchase.id },
      data: {
        pesapalOrderTrackingId: order.order_tracking_id ?? null,
        rawPayload: order as Prisma.InputJsonValue,
        status: SmsPurchaseStatus.AWAITING_PAYMENT,
      },
    });

    return {
      redirectUrl: order.redirect_url,
      purchaseId: updated.id,
      merchantReference,
      orderTrackingId: order.order_tracking_id ?? null,
      bundleId: bundle.id,
      bundleName: bundle.name,
      amountUgx: bundle.priceUgx,
      smsUnits: bundle.smsUnits,
      currency: 'UGX',
      status: updated.status,
    };
  }

  /**
   * Pesapal IPN/callback entry for SMS purchases.
   * Returns true when the tracking id belongs to an SMS purchase (or legacy top-up).
   */
  async finalizeIfSmsPayment(orderTrackingId: string): Promise<boolean> {
    const purchaseHandled = await this.finalizeSmsPurchase(orderTrackingId);
    if (purchaseHandled) return true;
    return this.finalizeLegacySmsCreditPayment(orderTrackingId);
  }

  async finalizeSmsPurchase(orderTrackingId: string): Promise<boolean> {
    let purchase = await this.prisma.smsPurchase.findFirst({
      where: { pesapalOrderTrackingId: orderTrackingId },
    });

    let status;
    try {
      status = await this.pesapal.getTransactionStatus(orderTrackingId);
    } catch (error) {
      this.logger.warn(
        `SMS purchase status verify failed for ${orderTrackingId}: ${
          error instanceof Error ? error.message : error
        }`,
      );
      await this.logCallbackEvent({
        provider: 'pesapal',
        merchantReference: purchase?.merchantReference ?? null,
        externalTransactionId: orderTrackingId,
        rawPayload: { orderTrackingId, error: String(error) },
        processingStatus: SmsCallbackProcessingStatus.FAILED,
        tenantId: purchase?.tenantId ?? null,
      });
      return Boolean(purchase);
    }

    if (!purchase && status.merchant_reference) {
      purchase = await this.prisma.smsPurchase.findFirst({
        where: { merchantReference: status.merchant_reference },
      });
    }

    await this.logCallbackEvent({
      provider: 'pesapal',
      merchantReference:
        purchase?.merchantReference ?? status.merchant_reference ?? null,
      externalTransactionId:
        String(
          status.confirmation_code ??
            (status as { payment_account_reference?: string })
              .payment_account_reference ??
            orderTrackingId,
        ) || null,
      rawPayload: status as unknown as Record<string, unknown>,
      processingStatus: SmsCallbackProcessingStatus.RECEIVED,
      tenantId: purchase?.tenantId ?? null,
    });

    if (!purchase) return false;

    if (purchase.status === SmsPurchaseStatus.CREDITED) {
      return true;
    }

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

    const paidAmount = Number(status.amount);
    const paidCurrency = String(status.currency || '').toUpperCase();
    const merchantRef = String(status.merchant_reference || '');
    const amountMismatch =
      completed &&
      (Math.round(paidAmount) !== purchase.amountExpected ||
        (paidCurrency && paidCurrency !== purchase.currency.toUpperCase()) ||
        (merchantRef && merchantRef !== purchase.merchantReference));

    if (amountMismatch) {
      await this.prisma.smsPurchase.update({
        where: { id: purchase.id },
        data: {
          pesapalOrderTrackingId: orderTrackingId,
          rawPayload: status as Prisma.InputJsonValue,
          status: SmsPurchaseStatus.PAYMENT_MISMATCH,
        },
      });
      this.logger.warn(
        `SMS purchase ${purchase.id} payment mismatch (expected ${purchase.amountExpected} ${purchase.currency})`,
      );
      return true;
    }

    if (!completed) {
      await this.prisma.smsPurchase.update({
        where: { id: purchase.id },
        data: {
          pesapalOrderTrackingId: orderTrackingId,
          rawPayload: status as Prisma.InputJsonValue,
          status:
            statusCode === 2 ||
            statusCode === 0 ||
            description.includes('failed') ||
            description.includes('invalid')
              ? SmsPurchaseStatus.PAYMENT_FAILED
              : statusCode === 3 || description.includes('reversed')
                ? SmsPurchaseStatus.REVERSED
                : SmsPurchaseStatus.AWAITING_PAYMENT,
        },
      });
      return true;
    }

    const externalTransactionId =
      String(
        status.confirmation_code ??
          (status as { payment_account_reference?: string })
            .payment_account_reference ??
          '',
      ).trim() || orderTrackingId;

    const creditResult = await this.creditPurchaseOnce({
      purchaseId: purchase.id,
      orderTrackingId,
      externalTransactionId,
      rawPayload: status as Prisma.InputJsonValue,
    });

    if (creditResult.credited) {
      void this.notifySmsPurchaseCredited(creditResult.purchaseId);
    }

    return true;
  }

  async findCompletedSmsBranchId(
    orderTrackingId: string,
  ): Promise<string | null> {
    const purchase = await this.prisma.smsPurchase.findFirst({
      where: {
        pesapalOrderTrackingId: orderTrackingId,
        status: SmsPurchaseStatus.CREDITED,
      },
      select: { branchId: true },
    });
    if (purchase) return purchase.branchId;

    const legacy = await this.prisma.smsCreditPayment.findFirst({
      where: {
        orderTrackingId,
        status: SubscriptionPaymentStatus.COMPLETED,
      },
      select: { branchId: true },
    });
    return legacy?.branchId ?? null;
  }

  /**
   * One-time Pro welcome pack as a ledger grant (not a Pesapal payment).
   * Idempotent per branch via unique ledger reference.
   */
  async grantProWelcomeSmsCredits(input: {
    tenantId: string;
    branchId: string;
  }): Promise<{ granted: boolean; credits: number }> {
    const credits = PRO_PLAN_WELCOME_SMS_CREDITS;
    const referenceId = input.branchId;
    const existing = await this.prisma.smsWalletLedger.findFirst({
      where: {
        branchId: input.branchId,
        referenceType: SMS_WELCOME_GRANT_REFERENCE_TYPE,
        referenceId,
        entryType: SmsWalletLedgerEntryType.GRANT,
      },
      select: { id: true },
    });
    if (existing) {
      return { granted: false, credits: 0 };
    }

    const wallet = await this.ensureWallet(input.tenantId, input.branchId);

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lockWallet(tx, wallet.id);
        const locked = await tx.branchSmsWallet.findUniqueOrThrow({
          where: { id: wallet.id },
        });
        const balanceBefore = locked.availableUnits;
        const balanceAfter = balanceBefore + credits;

        await tx.smsWalletLedger.create({
          data: {
            tenantId: input.tenantId,
            branchId: input.branchId,
            walletId: wallet.id,
            entryType: SmsWalletLedgerEntryType.GRANT,
            direction: SmsWalletLedgerDirection.CREDIT,
            units: credits,
            balanceBefore,
            balanceAfter,
            referenceType: SMS_WELCOME_GRANT_REFERENCE_TYPE,
            referenceId,
            description: `Pro welcome pack — ${credits} SMS`,
            createdBy: 'system',
          },
        });
        await tx.branchSmsWallet.update({
          where: { id: wallet.id },
          data: {
            availableUnits: balanceAfter,
            lifetimePurchased: { increment: credits },
            version: { increment: 1 },
          },
        });
      });
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        return { granted: false, credits: 0 };
      }
      // Concurrent grant race: second insert may fail on unique? We don't have unique on ledger.
      const raced = await this.prisma.smsWalletLedger.findFirst({
        where: {
          branchId: input.branchId,
          referenceType: SMS_WELCOME_GRANT_REFERENCE_TYPE,
          referenceId,
        },
        select: { id: true },
      });
      if (raced) return { granted: false, credits: 0 };
      throw error;
    }

    this.logger.log(
      `Pro welcome SMS +${credits} for branch ${input.branchId}`,
    );
    return { granted: true, credits };
  }

  /**
   * Reserve → provider capacity → send → settle/release/hold.
   * Platform OTP / billing reminders must use SmsService.sendText directly.
   */
  async sendBranchSms(input: {
    tenantId: string;
    branchId: string;
    destination: string;
    body: string;
    purpose: string;
    triggerSource?: string;
    triggerReferenceId?: string;
    requestedByUserId?: string;
    idempotencyKey?: string;
    parentMessageId?: string;
    attemptNumber?: number;
  }): Promise<SmsDispatchResult> {
    if (!input.branchId?.trim()) {
      throw new BadRequestException('A valid workspace (branch) is required.');
    }

    if (input.idempotencyKey) {
      const existing = await this.prisma.smsMessage.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        const accepted =
          existing.status === SmsMessageStatus.PROVIDER_ACCEPTED ||
          existing.status === SmsMessageStatus.SENT;
        return {
          sent: accepted,
          reason: accepted
            ? undefined
            : existing.failureReason ?? existing.status.toLowerCase(),
          messageId: existing.id,
          segmentsRequired: existing.segmentsRequired ?? undefined,
        };
      }
    }

    const wallet = await this.ensureWallet(input.tenantId, input.branchId);
    const phone = normalizeUgPhoneTo256(input.destination);
    const segments = analyzeSmsBody(input.body);
    const segmentsRequired = Math.max(1, segments.segmentsRequired);
    const reservationExpiresAt = new Date(
      Date.now() + SMS_RESERVED_STALE_TTL_MS,
    );

    let message;
    try {
      message = await this.prisma.smsMessage.create({
        data: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          walletId: wallet.id,
          recipientPhone: phone ?? input.destination.trim(),
          messageType: input.purpose,
          messageBody: input.body,
          triggerSource: input.triggerSource ?? input.purpose,
          triggerReferenceId: input.triggerReferenceId ?? null,
          requestedByUserId: input.requestedByUserId ?? null,
          status: SmsMessageStatus.PENDING_VALIDATION,
          deliveryStatus: SmsDeliveryStatus.NOT_APPLICABLE,
          encodingType: segments.encoding,
          characterCount: segments.characterCount,
          segmentsRequired,
          idempotencyKey: input.idempotencyKey ?? null,
          parentMessageId: input.parentMessageId ?? null,
          attemptNumber: input.attemptNumber ?? 1,
        },
      });
    } catch (error) {
      if (input.idempotencyKey && isPrismaUniqueConstraintError(error)) {
        const raced = await this.prisma.smsMessage.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (raced) {
          const accepted =
            raced.status === SmsMessageStatus.PROVIDER_ACCEPTED ||
            raced.status === SmsMessageStatus.SENT;
          return {
            sent: accepted,
            messageId: raced.id,
            segmentsRequired: raced.segmentsRequired ?? undefined,
            reason: accepted
              ? undefined
              : raced.failureReason ?? undefined,
          };
        }
      }
      throw error;
    }

    if (!phone) {
      await this.prisma.smsMessage.update({
        where: { id: message.id },
        data: {
          status: SmsMessageStatus.FAILED_VALIDATION,
          failureReason: 'invalid_phone',
          deliveryStatus: SmsDeliveryStatus.NOT_APPLICABLE,
        },
      });
      return {
        sent: false,
        reason: 'invalid_phone',
        messageId: message.id,
        segmentsRequired,
      };
    }

    const reserved = await this.reserveUnits({
      walletId: wallet.id,
      tenantId: input.tenantId,
      branchId: input.branchId,
      units: segmentsRequired,
      messageId: message.id,
    });

    if (!reserved.ok) {
      // Control #6 — never call Pahappa after a failed reservation.
      await this.prisma.smsMessage.update({
        where: { id: message.id },
        data: {
          status: SmsMessageStatus.FAILED_INSUFFICIENT_CREDITS,
          failureReason: 'no_credits',
        },
      });
      this.logger.log(
        `SMS skipped (no credits) branch=${input.branchId} purpose=${input.purpose} need=${segmentsRequired}`,
      );
      return {
        sent: false,
        reason: 'no_credits',
        messageId: message.id,
        segmentsRequired,
      };
    }

    await this.prisma.smsMessage.update({
      where: { id: message.id },
      data: {
        status: SmsMessageStatus.RESERVED,
        reservationExpiresAt,
      },
    });

    const providerOk = await this.assertProviderCapacity(segmentsRequired);
    if (!providerOk) {
      // Control #8 — failed pre-submission releases reserved units.
      await this.releaseRejectedReservation({
        walletId: wallet.id,
        tenantId: input.tenantId,
        branchId: input.branchId,
        units: segmentsRequired,
        messageId: message.id,
        status: SmsMessageStatus.BLOCKED_PROVIDER_UNAVAILABLE,
        failureReason: 'provider_unavailable',
      });
      return {
        sent: false,
        reason: 'provider_unavailable',
        messageId: message.id,
        segmentsRequired,
      };
    }

    const result = await this.smsService.sendText({
      destination: phone,
      body: input.body,
      requestReference: message.id,
    });

    await this.persistProviderRequestLog({
      tenantId: input.tenantId,
      branchId: input.branchId,
      walletId: wallet.id,
      smsMessageId: message.id,
      provider: result.provider,
      log: result.providerLog,
      outcome: result.outcome,
    });

    const providerMessageId =
      result.providerReference ??
      result.providerLog?.providerMessageId ??
      null;

    // Step 7A / 8 — definite acceptance: settle debit (available already reduced).
    if (result.outcome === 'accepted' && result.delivered) {
      await this.settleAcceptedReservation({
        walletId: wallet.id,
        tenantId: input.tenantId,
        branchId: input.branchId,
        units: segmentsRequired,
        messageId: message.id,
        providerMessageId,
      });
      return {
        sent: true,
        messageId: message.id,
        segmentsRequired,
        deliveryStatus: SmsDeliveryStatus.PENDING,
      };
    }

    // Step 7B / 8 — definite rejection: release reserve in one transaction.
    if (result.outcome === 'rejected' || result.outcome === 'skipped') {
      await this.releaseRejectedReservation({
        walletId: wallet.id,
        tenantId: input.tenantId,
        branchId: input.branchId,
        units: segmentsRequired,
        messageId: message.id,
        status: SmsMessageStatus.PROVIDER_FAILED,
        failureReason:
          result.failureReason ??
          (result.outcome === 'skipped'
            ? 'provider_skipped'
            : 'provider_rejected'),
        providerMessageId,
      });
      this.logger.warn(
        `SMS provider ${result.outcome}; reserve released branch=${input.branchId} reason=${result.failureReason ?? result.outcome}`,
      );
      return {
        sent: false,
        reason:
          result.failureReason ??
          (result.outcome === 'skipped'
            ? 'provider_skipped'
            : 'provider_rejected'),
        messageId: message.id,
        segmentsRequired,
      };
    }

    // Ambiguous / skipped — hold reservation for reconciliation (controls #7, #8).
    // Do not retry immediately; do not leave forever (cron releases at expiry).
    const uncertainExpires = new Date(
      Date.now() + SMS_UNCERTAIN_RESERVATION_TTL_MS,
    );
    await this.prisma.smsMessage.update({
      where: { id: message.id },
      data: {
        status: SmsMessageStatus.PROVIDER_UNCERTAIN,
        failureReason: result.failureReason ?? 'provider_ambiguous',
        providerMessageId,
        reservationExpiresAt: uncertainExpires,
        deliveryStatus: SmsDeliveryStatus.UNKNOWN,
      },
    });
    this.logger.warn(
      `SMS provider uncertain; reservation held until ${uncertainExpires.toISOString()} message=${message.id}`,
    );
    return {
      sent: false,
      reason: 'provider_ambiguous',
      messageId: message.id,
      segmentsRequired,
    };
  }

  /**
   * Workflow C — retry a failed/retryable message as a new attempt row.
   * Never overwrites the original; never retries PROVIDER_UNCERTAIN immediately.
   */
  async retryBranchSms(
    user: AuthenticatedUser,
    messageId: string,
    overrides?: { destination?: string; body?: string },
  ): Promise<SmsDispatchResult> {
    const original = await this.prisma.smsMessage.findFirst({
      where: { id: messageId, tenantId: user.tenantId },
    });
    if (!original) {
      throw new NotFoundException('SMS message not found.');
    }

    await this.resolveBranch(user, original.branchId);

    if (
      !(SMS_RETRYABLE_STATUSES as readonly string[]).includes(original.status)
    ) {
      throw new BadRequestException(
        original.status === SmsMessageStatus.PROVIDER_UNCERTAIN
          ? 'This message is waiting for provider confirmation and cannot be retried yet.'
          : 'This message cannot be retried.',
      );
    }

    // Step 2 — confirm not accepted and no active attempt.
    if (
      original.status === SmsMessageStatus.PROVIDER_ACCEPTED ||
      original.status === SmsMessageStatus.SENT
    ) {
      throw new BadRequestException('This message was already accepted.');
    }

    const activeChild = await this.prisma.smsMessage.findFirst({
      where: {
        parentMessageId: original.id,
        status: {
          in: [
            SmsMessageStatus.RESERVED,
            SmsMessageStatus.PROVIDER_UNCERTAIN,
            SmsMessageStatus.PENDING_VALIDATION,
          ],
        },
      },
      select: { id: true },
    });
    if (activeChild) {
      throw new BadRequestException(
        'An active send attempt already exists for this message.',
      );
    }

    const attemptNumber = original.attemptNumber + 1;
    const destination =
      overrides?.destination?.trim() || original.recipientPhone;
    const body = overrides?.body?.trim() || original.messageBody;

    return this.sendBranchSms({
      tenantId: original.tenantId,
      branchId: original.branchId,
      destination,
      body,
      purpose: original.messageType,
      triggerSource: original.triggerSource,
      triggerReferenceId: original.triggerReferenceId ?? undefined,
      requestedByUserId: user.userId,
      parentMessageId: original.id,
      attemptNumber,
      idempotencyKey: `retry_${original.id}_${attemptNumber}`,
    });
  }

  /** Release unresolved RESERVED / PROVIDER_UNCERTAIN reservations past expiry. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcileExpiredReservations() {
    const now = new Date();
    const stale = await this.prisma.smsMessage.findMany({
      where: {
        status: {
          in: [SmsMessageStatus.RESERVED, SmsMessageStatus.PROVIDER_UNCERTAIN],
        },
        reservationExpiresAt: { lte: now },
      },
      take: 100,
      orderBy: { reservationExpiresAt: 'asc' },
    });

    for (const row of stale) {
      try {
        const units = Math.max(1, row.segmentsRequired ?? 1);
        await this.releaseRejectedReservation({
          walletId: row.walletId,
          tenantId: row.tenantId,
          branchId: row.branchId,
          units,
          messageId: row.id,
          status: SmsMessageStatus.RELEASED,
          failureReason:
            row.status === SmsMessageStatus.PROVIDER_UNCERTAIN
              ? 'uncertain_reservation_expired'
              : 'stale_reservation_expired',
          providerMessageId: row.providerMessageId,
        });
        this.logger.warn(
          `SMS reservation reconciled/released message=${row.id} prior=${row.status}`,
        );
      } catch (error) {
        this.logger.warn(
          `SMS reservation reconcile failed for ${row.id}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }
  }

  /** Purchase rows for billing history (new catalogue flow). */
  async listPurchaseHistoryRows(input: {
    tenantId: string;
    branchId?: string;
  }) {
    const where = input.branchId
      ? { tenantId: input.tenantId, branchId: input.branchId }
      : { tenantId: input.tenantId };

    return this.prisma.smsPurchase.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { branch: { select: { name: true } } },
    });
  }

  private async creditPurchaseOnce(input: {
    purchaseId: string;
    orderTrackingId: string;
    externalTransactionId: string;
    rawPayload: Prisma.InputJsonValue;
  }): Promise<{ credited: boolean; purchaseId: string }> {
    try {
      const credited = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT id FROM "sms_purchases" WHERE id = ${input.purchaseId} FOR UPDATE
        `;
        const purchase = await tx.smsPurchase.findUniqueOrThrow({
          where: { id: input.purchaseId },
        });

        if (purchase.status === SmsPurchaseStatus.CREDITED) {
          return false;
        }

        if (purchase.externalTransactionId) {
          return false;
        }

        await this.lockWallet(tx, purchase.walletId);
        const wallet = await tx.branchSmsWallet.findUniqueOrThrow({
          where: { id: purchase.walletId },
        });

        const units = purchase.smsUnitsExpected;
        const balanceBefore = wallet.availableUnits;
        const balanceAfter = balanceBefore + units;
        const now = new Date();

        await tx.smsPurchase.update({
          where: { id: purchase.id },
          data: {
            status: SmsPurchaseStatus.CREDITED,
            pesapalOrderTrackingId: input.orderTrackingId,
            externalTransactionId: input.externalTransactionId,
            rawPayload: input.rawPayload,
            creditedAt: now,
          },
        });

        await tx.smsWalletLedger.create({
          data: {
            tenantId: purchase.tenantId,
            branchId: purchase.branchId,
            walletId: purchase.walletId,
            entryType: SmsWalletLedgerEntryType.BUNDLE_PURCHASE,
            direction: SmsWalletLedgerDirection.CREDIT,
            units,
            balanceBefore,
            balanceAfter,
            referenceType: 'sms_purchase',
            referenceId: purchase.id,
            description: `${purchase.bundleNameSnapshot} — ${units} SMS`,
            createdBy: purchase.initiatedByUserId,
          },
        });

        await tx.branchSmsWallet.update({
          where: { id: wallet.id },
          data: {
            availableUnits: balanceAfter,
            lifetimePurchased: { increment: units },
            version: { increment: 1 },
          },
        });

        return true;
      });

      return { credited, purchaseId: input.purchaseId };
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        this.logger.log(
          `SMS purchase credit idempotent hit for ${input.externalTransactionId}`,
        );
        return { credited: false, purchaseId: input.purchaseId };
      }
      throw error;
    }
  }

  private async finalizeLegacySmsCreditPayment(
    orderTrackingId: string,
  ): Promise<boolean> {
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
      await this.lockWallet(tx, payment.walletId);
      const wallet = await tx.branchSmsWallet.findUniqueOrThrow({
        where: { id: payment.walletId },
      });
      const balanceBefore = wallet.availableUnits;
      const balanceAfter = balanceBefore + payment.credits;

      await tx.smsCreditPayment.update({
        where: { id: payment.id },
        data: {
          status: SubscriptionPaymentStatus.COMPLETED,
          orderTrackingId,
          paidAt: now,
          rawPayload: status as Prisma.InputJsonValue,
        },
      });
      await tx.smsWalletLedger.create({
        data: {
          tenantId: payment.tenantId,
          branchId: payment.branchId,
          walletId: payment.walletId,
          entryType: SmsWalletLedgerEntryType.BUNDLE_PURCHASE,
          direction: SmsWalletLedgerDirection.CREDIT,
          units: payment.credits,
          balanceBefore,
          balanceAfter,
          referenceType: 'sms_credit_payment',
          referenceId: payment.id,
          description: `Legacy SMS top-up — ${payment.credits} SMS`,
          createdBy: 'system',
        },
      });
      await tx.branchSmsWallet.update({
        where: { id: wallet.id },
        data: {
          availableUnits: balanceAfter,
          lifetimePurchased: { increment: payment.credits },
          version: { increment: 1 },
        },
      });
    });

    this.logger.log(
      `Legacy SMS credits +${payment.credits} for branch ${payment.branchId}`,
    );
    return true;
  }

  private async reserveUnits(input: {
    walletId: string;
    tenantId: string;
    branchId: string;
    units: number;
    messageId: string;
  }): Promise<{ ok: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockWallet(tx, input.walletId);
      const wallet = await tx.branchSmsWallet.findUniqueOrThrow({
        where: { id: input.walletId },
      });
      if (wallet.availableUnits < input.units) {
        return { ok: false };
      }
      const balanceBefore = wallet.availableUnits;
      const balanceAfter = balanceBefore - input.units;
      await tx.branchSmsWallet.update({
        where: { id: wallet.id },
        data: {
          availableUnits: balanceAfter,
          reservedUnits: { increment: input.units },
          version: { increment: 1 },
        },
      });
      await tx.smsWalletLedger.create({
        data: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          walletId: input.walletId,
          entryType: SmsWalletLedgerEntryType.RESERVE,
          direction: SmsWalletLedgerDirection.DEBIT,
          units: input.units,
          balanceBefore,
          balanceAfter,
          referenceType: 'sms_message',
          referenceId: input.messageId,
          description: `Reserved ${input.units} SMS`,
          createdBy: 'system',
        },
      });
      return { ok: true };
    });
  }

  /**
   * Step 8 — accepted: debit ledger only (available already reduced at reserve).
   * Also marks PROVIDER_ACCEPTED with delivery PENDING (Step 9).
   */
  private async settleAcceptedReservation(input: {
    walletId: string;
    tenantId: string;
    branchId: string;
    units: number;
    messageId: string;
    providerMessageId: string | null;
  }) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockWallet(tx, input.walletId);
      const wallet = await tx.branchSmsWallet.findUniqueOrThrow({
        where: { id: input.walletId },
      });
      const balanceBefore = wallet.availableUnits;
      await tx.branchSmsWallet.update({
        where: { id: wallet.id },
        data: {
          reservedUnits: { decrement: input.units },
          lifetimeUsed: { increment: input.units },
          version: { increment: 1 },
        },
      });
      await tx.smsWalletLedger.create({
        data: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          walletId: input.walletId,
          entryType: SmsWalletLedgerEntryType.DEBIT_CONFIRMED,
          direction: SmsWalletLedgerDirection.DEBIT,
          units: input.units,
          balanceBefore,
          balanceAfter: balanceBefore,
          referenceType: 'sms_message',
          referenceId: input.messageId,
          description: `Sent ${input.units} SMS`,
          createdBy: 'system',
        },
      });
      await tx.smsMessage.update({
        where: { id: input.messageId },
        data: {
          status: SmsMessageStatus.PROVIDER_ACCEPTED,
          deliveryStatus: SmsDeliveryStatus.PENDING,
          providerMessageId: input.providerMessageId,
          sentAt: new Date(),
          failureReason: null,
          reservationExpiresAt: null,
        },
      });
    });
  }

  /**
   * Step 8 — rejected / expired / pre-submit failure: restore available, clear reserve.
   */
  private async releaseRejectedReservation(input: {
    walletId: string;
    tenantId: string;
    branchId: string;
    units: number;
    messageId: string;
    status: SmsMessageStatus;
    failureReason: string;
    providerMessageId?: string | null;
  }) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM "sms_messages" WHERE id = ${input.messageId} FOR UPDATE
      `;
      const message = await tx.smsMessage.findUniqueOrThrow({
        where: { id: input.messageId },
      });
      // Idempotent: already terminal with no hold.
      if (
        message.status === SmsMessageStatus.PROVIDER_ACCEPTED ||
        message.status === SmsMessageStatus.SENT ||
        (message.status === input.status &&
          message.status !== SmsMessageStatus.RESERVED &&
          message.status !== SmsMessageStatus.PROVIDER_UNCERTAIN)
      ) {
        return;
      }

      const stillHolding =
        message.status === SmsMessageStatus.RESERVED ||
        message.status === SmsMessageStatus.PROVIDER_UNCERTAIN;

      if (stillHolding) {
        await this.lockWallet(tx, input.walletId);
        const wallet = await tx.branchSmsWallet.findUniqueOrThrow({
          where: { id: input.walletId },
        });
        const balanceBefore = wallet.availableUnits;
        const balanceAfter = balanceBefore + input.units;
        await tx.branchSmsWallet.update({
          where: { id: wallet.id },
          data: {
            availableUnits: balanceAfter,
            reservedUnits: { decrement: input.units },
            version: { increment: 1 },
          },
        });
        await tx.smsWalletLedger.create({
          data: {
            tenantId: input.tenantId,
            branchId: input.branchId,
            walletId: input.walletId,
            entryType: SmsWalletLedgerEntryType.RELEASE,
            direction: SmsWalletLedgerDirection.CREDIT,
            units: input.units,
            balanceBefore,
            balanceAfter,
            referenceType: 'sms_message',
            referenceId: input.messageId,
            description: `Released ${input.units} SMS reserve`,
            createdBy: 'system',
          },
        });
      }

      await tx.smsMessage.update({
        where: { id: input.messageId },
        data: {
          status: input.status,
          failureReason: input.failureReason,
          providerMessageId:
            input.providerMessageId ?? message.providerMessageId,
          reservationExpiresAt: null,
          deliveryStatus: SmsDeliveryStatus.NOT_APPLICABLE,
        },
      });
    });
  }

  private async persistProviderRequestLog(input: {
    tenantId: string;
    branchId: string;
    walletId: string;
    smsMessageId: string;
    provider: string;
    log?: SmsProviderRequestLogPayload;
    outcome: string;
  }) {
    if (!input.log) return;
    try {
      await this.prisma.smsProviderRequestLog.create({
        data: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          walletId: input.walletId,
          smsMessageId: input.smsMessageId,
          provider: input.provider,
          requestTime: new Date(input.log.requestTime),
          providerEndpoint: input.log.providerEndpoint,
          requestReference: input.log.requestReference,
          requestMetadata: input.log.requestMetadata as Prisma.InputJsonValue,
          responseCode: input.log.responseCode,
          providerMessageId: input.log.providerMessageId,
          responseTimeMs: input.log.responseTimeMs,
          outcome: input.log.outcome || input.outcome,
        },
      });
    } catch (error) {
      this.logger.warn(
        `SMS provider request log persist failed: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  /**
   * When Pahappa is configured, require enough float for the send.
   * Failures/unknowns do not block mock/dev providers.
   * Never expose float emptiness to end users (generic reason only).
   */
  private async assertProviderCapacity(segmentsRequired: number): Promise<boolean> {
    const probe =
      this.configService.get<string>('SMS_PROVIDER')?.trim().toLowerCase() ||
      'mock';
    if (probe !== 'pahappa' && probe !== 'egosms' && probe !== 'auto') {
      return true;
    }

    const balance = await this.smsService.getPahappaBalance();
    if (!balance.ok) {
      // Soft-fail open when balance probe fails (ops alert via log).
      this.logger.warn(
        `Pahappa balance probe failed before send: ${balance.message}`,
      );
      return true;
    }

    const numeric = Number(
      String(balance.balance ?? '')
        .replace(/,/g, '')
        .replace(/[^\d.]/g, ''),
    );
    if (!Number.isFinite(numeric)) {
      this.logger.warn(
        `Pahappa balance unparseable: ${String(balance.balance)}`,
      );
      return true;
    }

    // EgoSMS balance is typically credit/UGX float; treat units as SMS count when small,
    // otherwise require at least segmentsRequired units of float.
    if (numeric < segmentsRequired) {
      this.logger.warn(
        `Pahappa capacity insufficient for ${segmentsRequired} segments (balance=${numeric})`,
      );
      return false;
    }
    return true;
  }

  private async notifySmsPurchaseCredited(purchaseId: string) {
    try {
      const purchase = await this.prisma.smsPurchase.findUnique({
        where: { id: purchaseId },
        include: {
          branch: { select: { name: true } },
          wallet: { select: { availableUnits: true } },
        },
      });
      if (!purchase || purchase.status !== SmsPurchaseStatus.CREDITED) return;

      const payer = await this.prisma.user.findUnique({
        where: { id: purchase.initiatedByUserId },
        select: { email: true, displayName: true },
      });

      if (payer?.email) {
        await this.notificationsService.sendSmsPurchaseReceiptEmail({
          destination: payer.email,
          payerName: payer.displayName || 'there',
          branchName: purchase.branch.name,
          bundleName: purchase.bundleNameSnapshot,
          amountUgx: purchase.amountExpected,
          smsUnits: purchase.smsUnitsExpected,
          newBalance: purchase.wallet.availableUnits,
          reference: purchase.merchantReference,
        });
      }

      const owners = await this.prisma.user.findMany({
        where: {
          tenantId: purchase.tenantId,
          status: 'ACTIVE',
          roles: {
            some: { role: { name: 'Account Owner' } },
          },
        },
        select: { id: true, email: true },
      });

      const adminEmail =
        this.configService.get<string>('SMS_ADMIN_ALERT_EMAIL')?.trim() ||
        this.configService.get<string>('EMAIL_FROM')?.trim() ||
        undefined;

      if (adminEmail) {
        await this.notificationsService.sendSmsPurchaseAdminAlertEmail({
          destination: adminEmail,
          branchName: purchase.branch.name,
          bundleName: purchase.bundleNameSnapshot,
          amountUgx: purchase.amountExpected,
          smsUnits: purchase.smsUnitsExpected,
          reference: purchase.merchantReference,
          tenantId: purchase.tenantId,
        });
      }

      for (const owner of owners) {
        await this.fcmPushService.sendToUser(purchase.tenantId, owner.id, {
          title: 'SMS credits added',
          body: `${purchase.smsUnitsExpected.toLocaleString('en-UG')} SMS credited to ${purchase.branch.name}.`,
          href: '/owner/subscription?tab=sms',
          data: {
            type: 'sms_purchase',
            branchId: purchase.branchId,
            purchaseId: purchase.id,
          },
        });
        if (owner.email && owner.email !== payer?.email) {
          await this.notificationsService.sendSmsPurchaseAdminAlertEmail({
            destination: owner.email,
            branchName: purchase.branch.name,
            bundleName: purchase.bundleNameSnapshot,
            amountUgx: purchase.amountExpected,
            smsUnits: purchase.smsUnitsExpected,
            reference: purchase.merchantReference,
            tenantId: purchase.tenantId,
          });
        }
      }
    } catch (error) {
      this.logger.warn(
        `SMS purchase notify failed for ${purchaseId}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  private async logCallbackEvent(input: {
    provider: string;
    merchantReference: string | null;
    externalTransactionId: string | null;
    rawPayload: Record<string, unknown>;
    processingStatus: SmsCallbackProcessingStatus;
    tenantId: string | null;
  }) {
    const raw = JSON.stringify(input.rawPayload);
    const payloadHash = createHash('sha256').update(raw).digest('hex');
    try {
      await this.prisma.smsCallbackEvent.create({
        data: {
          provider: input.provider,
          merchantReference: input.merchantReference,
          externalTransactionId: input.externalTransactionId,
          payloadHash,
          rawPayload: input.rawPayload as Prisma.InputJsonValue,
          processingStatus: input.processingStatus,
          tenantId: input.tenantId,
        },
      });
    } catch (error) {
      this.logger.warn(
        `SMS callback log failed: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  private async expireStalePurchasesForBranch(branchId: string) {
    const now = new Date();
    await this.prisma.smsPurchase.updateMany({
      where: {
        branchId,
        status: {
          in: [
            SmsPurchaseStatus.PAYMENT_PENDING,
            SmsPurchaseStatus.AWAITING_PAYMENT,
          ],
        },
        expiresAt: { lt: now },
      },
      data: { status: SmsPurchaseStatus.EXPIRED },
    });
  }

  private async lockWallet(tx: TxClient, walletId: string) {
    await tx.$queryRaw`
      SELECT id FROM "branch_sms_wallets" WHERE id = ${walletId} FOR UPDATE
    `;
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
        availableUnits: 0,
        reservedUnits: 0,
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
    wallet: { availableUnits: number; reservedUnits: number },
  ): SmsWalletContract {
    return {
      branchId,
      branchName,
      availableUnits: wallet.availableUnits,
      reservedUnits: wallet.reservedUnits,
      creditsRemaining: wallet.availableUnits,
      canSendSms: wallet.availableUnits > 0,
    };
  }
}
