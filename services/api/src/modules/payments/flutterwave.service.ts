import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaymentGatewayIntentStatus,
  PaymentGatewayProvider,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import type { InitializeFlutterwavePaymentDto } from './dto/initialize-flutterwave-payment.dto';

type FlutterwaveApiResponse<T> = {
  status: string;
  message: string;
  data?: T;
};

type FlutterwavePaymentData = {
  link?: string;
};

type FlutterwaveVerifyData = {
  id?: number | string;
  tx_ref?: string;
  flw_ref?: string;
  amount?: number;
  currency?: string;
  status?: string;
  charged_amount?: number;
  customer?: {
    email?: string;
    name?: string;
    phone_number?: string;
  };
};

@Injectable()
export class FlutterwaveService {
  private readonly logger = new Logger(FlutterwaveService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  isEnabled() {
    return (
      this.configService.get<string>('FLW_ENABLED')?.trim().toLowerCase() ===
        'true' && Boolean(this.secretKey())
    );
  }

  /** Safe for clients — never includes secret key or secret hash. */
  getPublicConfig() {
    return {
      enabled: this.isEnabled(),
      publicKey: this.isEnabled() ? this.publicKey() : null,
      currency: this.configService.get<string>('FLW_DEFAULT_CURRENCY')?.trim() || 'UGX',
      mode: this.secretKey()?.includes('_TEST') ? 'test' : 'live',
    };
  }

  async initializePayment(
    user: AuthenticatedUser,
    dto: InitializeFlutterwavePaymentDto,
  ) {
    this.assertReady();

    const amount = Number(dto.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be a positive number.');
    }

    const currency = (
      dto.currency?.trim() ||
      this.configService.get<string>('FLW_DEFAULT_CURRENCY')?.trim() ||
      'UGX'
    ).toUpperCase();

    const txRef = this.createTxRef(user.tenantId);
    const redirectUrl =
      dto.redirectUrl?.trim() ||
      this.configService.get<string>('FLW_REDIRECT_URL')?.trim();
    if (!redirectUrl) {
      throw new BadRequestException(
        'redirectUrl is required (or set FLW_REDIRECT_URL).',
      );
    }

    const intent = await this.prisma.paymentGatewayIntent.create({
      data: {
        tenantId: user.tenantId,
        provider: PaymentGatewayProvider.FLUTTERWAVE,
        txRef,
        amount: new Prisma.Decimal(amount.toFixed(2)),
        currency,
        status: PaymentGatewayIntentStatus.PENDING,
        purpose: dto.purpose.trim(),
        customerEmail: dto.customerEmail?.trim() || null,
        customerPhone: dto.customerPhone?.trim() || null,
        customerName: dto.customerName?.trim() || null,
        loanId: dto.loanId || null,
        branchId: dto.branchId || user.branchId || null,
        initiatedByUserId: user.userId,
        metadata: {
          note: dto.note?.trim() || null,
        },
      },
    });

    const payload = {
      tx_ref: txRef,
      amount,
      currency,
      redirect_url: redirectUrl,
      payment_options: dto.paymentOptions?.trim() || 'card,mobilemoneyuganda,ussd',
      customer: {
        email: dto.customerEmail?.trim() || `payments+${user.tenantId.slice(0, 8)}@rembeh.local`,
        name: dto.customerName?.trim() || undefined,
        phonenumber: dto.customerPhone?.trim() || undefined,
      },
      customizations: {
        title: dto.title?.trim() || 'REMBEH Payment',
        description: dto.purpose.trim(),
      },
      meta: {
        tenantId: user.tenantId,
        purpose: dto.purpose.trim(),
        loanId: dto.loanId || undefined,
        intentId: intent.id,
      },
    };

    const response = await this.flwRequest<FlutterwavePaymentData>(
      'POST',
      '/payments',
      payload,
    );

    const link = response.data?.link;
    if (response.status !== 'success' || !link) {
      await this.prisma.paymentGatewayIntent.update({
        where: { id: intent.id },
        data: {
          status: PaymentGatewayIntentStatus.FAILED,
          failureReason: response.message || 'Flutterwave initialize failed.',
        },
      });
      throw new BadRequestException(
        response.message || 'Could not initialize Flutterwave payment.',
      );
    }

    const updated = await this.prisma.paymentGatewayIntent.update({
      where: { id: intent.id },
      data: { paymentLink: link },
    });

    return {
      intentId: updated.id,
      txRef: updated.txRef,
      amount: Number(updated.amount),
      currency: updated.currency,
      paymentLink: link,
      status: updated.status,
    };
  }

  /**
   * Server-side verification — never trust redirect query params alone.
   * Re-checks amount + currency + tx_ref against our intent.
   */
  async verifyByTransactionId(
    user: AuthenticatedUser,
    transactionId: string,
  ) {
    this.assertReady();
    const verified = await this.fetchVerifiedTransaction(transactionId);
    return this.applyVerifiedTransaction(verified, user.tenantId);
  }

  async verifyByTxRef(user: AuthenticatedUser, txRef: string) {
    const intent = await this.prisma.paymentGatewayIntent.findFirst({
      where: { tenantId: user.tenantId, txRef: txRef.trim() },
    });
    if (!intent) {
      throw new BadRequestException('Payment intent not found.');
    }
    if (!intent.flwTransactionId) {
      throw new BadRequestException(
        'No Flutterwave transaction id yet. Wait for webhook or pass transactionId.',
      );
    }
    return this.verifyByTransactionId(user, intent.flwTransactionId);
  }

  async handleWebhook(verifHash: string | undefined, body: unknown) {
    this.assertReady();
    this.assertWebhookHash(verifHash);

    const payload = body as {
      event?: string;
      data?: FlutterwaveVerifyData;
    };
    const data = payload.data;
    if (!data?.tx_ref) {
      this.logger.warn('Flutterwave webhook missing tx_ref — discarded.');
      return { accepted: false };
    }

    const intent = await this.prisma.paymentGatewayIntent.findUnique({
      where: { txRef: String(data.tx_ref) },
    });
    if (!intent) {
      this.logger.warn(
        `Flutterwave webhook for unknown tx_ref=${data.tx_ref} — discarded.`,
      );
      return { accepted: false };
    }

    await this.prisma.paymentGatewayIntent.update({
      where: { id: intent.id },
      data: {
        lastEventType: payload.event?.slice(0, 120) || 'webhook',
        flwTransactionId: data.id != null ? String(data.id) : intent.flwTransactionId,
        flwFlwRef: data.flw_ref ? String(data.flw_ref) : intent.flwFlwRef,
      },
    });

    // Always re-verify with Flutterwave — never trust webhook body amounts alone.
    if (data.id != null) {
      const verified = await this.fetchVerifiedTransaction(String(data.id));
      await this.applyVerifiedTransaction(verified, intent.tenantId);
    }

    return { accepted: true };
  }

  private async fetchVerifiedTransaction(transactionId: string) {
    const response = await this.flwRequest<FlutterwaveVerifyData>(
      'GET',
      `/transactions/${encodeURIComponent(transactionId)}/verify`,
    );
    if (response.status !== 'success' || !response.data) {
      throw new BadRequestException(
        response.message || 'Flutterwave verification failed.',
      );
    }
    return response.data;
  }

  private async applyVerifiedTransaction(
    data: FlutterwaveVerifyData,
    tenantId: string,
  ) {
    const txRef = String(data.tx_ref ?? '');
    if (!txRef) {
      throw new BadRequestException('Verified payment missing tx_ref.');
    }

    const intent = await this.prisma.paymentGatewayIntent.findFirst({
      where: { tenantId, txRef },
    });
    if (!intent) {
      throw new BadRequestException('Payment intent not found for tx_ref.');
    }

    const remoteStatus = String(data.status ?? '').toLowerCase();
    const remoteAmount = Number(data.amount ?? data.charged_amount);
    const remoteCurrency = String(data.currency ?? '').toUpperCase();
    const expectedAmount = Number(intent.amount);

    const amountMatches =
      Number.isFinite(remoteAmount) &&
      Math.abs(remoteAmount - expectedAmount) < 0.01;
    const currencyMatches = remoteCurrency === intent.currency.toUpperCase();

    let nextStatus: PaymentGatewayIntentStatus = PaymentGatewayIntentStatus.FAILED;
    let failureReason: string | null = null;

    if (remoteStatus === 'successful' && amountMatches && currencyMatches) {
      nextStatus = PaymentGatewayIntentStatus.SUCCESSFUL;
    } else if (remoteStatus === 'successful') {
      nextStatus = PaymentGatewayIntentStatus.FAILED;
      failureReason = 'Amount or currency mismatch after verification.';
      this.logger.error(
        `Flutterwave amount mismatch tx_ref=${txRef} expected=${expectedAmount} ${intent.currency} got=${remoteAmount} ${remoteCurrency}`,
      );
    } else if (remoteStatus === 'cancelled') {
      nextStatus = PaymentGatewayIntentStatus.CANCELLED;
      failureReason = 'Payment cancelled.';
    } else {
      failureReason = `Payment status: ${remoteStatus || 'unknown'}`;
    }

    const updated = await this.prisma.paymentGatewayIntent.update({
      where: { id: intent.id },
      data: {
        status: nextStatus,
        flwTransactionId: data.id != null ? String(data.id) : intent.flwTransactionId,
        flwFlwRef: data.flw_ref ? String(data.flw_ref) : intent.flwFlwRef,
        verifiedAmount: Number.isFinite(remoteAmount)
          ? new Prisma.Decimal(remoteAmount.toFixed(2))
          : null,
        verifiedCurrency: remoteCurrency || null,
        verifiedAt: new Date(),
        failureReason,
        lastEventType: 'verify',
      },
    });

    return {
      intentId: updated.id,
      txRef: updated.txRef,
      status: updated.status,
      amount: Number(updated.amount),
      currency: updated.currency,
      verifiedAmount: updated.verifiedAmount
        ? Number(updated.verifiedAmount)
        : null,
      verifiedCurrency: updated.verifiedCurrency,
      flwTransactionId: updated.flwTransactionId,
      failureReason: updated.failureReason,
    };
  }

  private assertWebhookHash(headerValue: string | undefined) {
    const expected = this.configService.get<string>('FLW_SECRET_HASH')?.trim();
    if (!expected) {
      throw new ServiceUnavailableException(
        'FLW_SECRET_HASH is not configured.',
      );
    }
    if (!headerValue) {
      throw new UnauthorizedException('Missing Flutterwave verif-hash.');
    }

    const left = Buffer.from(headerValue);
    const right = Buffer.from(expected);
    if (
      left.length !== right.length ||
      !timingSafeEqual(left, right)
    ) {
      throw new UnauthorizedException('Invalid Flutterwave verif-hash.');
    }
  }

  private assertReady() {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException(
        'Flutterwave is not enabled. Set FLW_ENABLED=true and FLW_SECRET_KEY.',
      );
    }
  }

  private secretKey() {
    return this.configService.get<string>('FLW_SECRET_KEY')?.trim() || '';
  }

  private publicKey() {
    return this.configService.get<string>('FLW_PUBLIC_KEY')?.trim() || '';
  }

  private baseUrl() {
    return (
      this.configService.get<string>('FLW_BASE_URL')?.trim().replace(/\/$/, '') ||
      'https://api.flutterwave.com/v3'
    );
  }

  private createTxRef(tenantId: string) {
    const stamp = Date.now().toString(36);
    const nonce = randomBytes(8).toString('hex');
    const tenantHash = createHash('sha256')
      .update(tenantId)
      .digest('hex')
      .slice(0, 8);
    return `rb_${tenantHash}_${stamp}_${nonce}`;
  }

  private async flwRequest<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<FlutterwaveApiResponse<T>> {
    const secret = this.secretKey();
    const response = await fetch(`${this.baseUrl()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: body == null ? undefined : JSON.stringify(body),
    });

    const raw = (await response.json().catch(() => ({}))) as FlutterwaveApiResponse<T>;
    if (!response.ok) {
      this.logger.warn(
        `Flutterwave ${method} ${path} failed status=${response.status} message=${raw.message ?? ''}`,
      );
    }
    return raw;
  }
}
