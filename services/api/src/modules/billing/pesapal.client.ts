import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type PesapalTokenResponse = {
  token?: string;
  expiryDate?: string;
  error?: { message?: string; code?: string };
  status?: string;
  message?: string;
};

type PesapalIpnItem = {
  ipn_id?: string;
  url?: string;
  ipn_status?: number;
  ipn_status_decription?: string;
  notification_type?: number;
};

type PesapalIpnResponse = PesapalIpnItem & {
  error?: { message?: string };
  status?: string;
  message?: string;
};

type PesapalSubmitOrderResponse = {
  order_tracking_id?: string;
  merchant_reference?: string;
  redirect_url?: string;
  error?: { message?: string; code?: string; error_type?: string };
  status?: string;
  message?: string;
};

type PesapalTransactionStatusResponse = {
  payment_status_description?: string;
  payment_status_code?: number | string;
  amount?: number;
  currency?: string;
  merchant_reference?: string;
  order_tracking_id?: string;
  confirmation_code?: string;
  payment_method?: string;
  message?: string;
  status?: string;
  error?: { message?: string };
  [key: string]: unknown;
};

@Injectable()
export class PesapalClient implements OnModuleInit {
  private readonly logger = new Logger(PesapalClient.name);
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;
  private ipnId: string | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const configured = this.configService
      .get<string>('PESAPAL_IPN_NOTIFICATION_ID')
      ?.trim();
    if (configured) {
      this.ipnId = configured;
    }
  }

  isConfigured() {
    return Boolean(this.consumerKey() && this.consumerSecret());
  }

  baseUrl() {
    const env = (
      this.configService.get<string>('PESAPAL_ENV')?.trim() || 'sandbox'
    ).toLowerCase();
    if (env === 'live' || env === 'production') {
      return 'https://pay.pesapal.com/v3';
    }
    return 'https://cybqa.pesapal.com/pesapalv3';
  }

  async getAccessToken(force = false): Promise<string> {
    if (
      !force &&
      this.cachedToken &&
      Date.now() < this.tokenExpiresAt - 30_000
    ) {
      return this.cachedToken;
    }

    const response = await fetch(`${this.baseUrl()}/api/Auth/RequestToken`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        consumer_key: this.consumerKey(),
        consumer_secret: this.consumerSecret(),
      }),
    });
    const payload = (await response.json()) as PesapalTokenResponse;
    if (!response.ok || !payload.token) {
      this.logger.warn(
        `Pesapal auth failed: ${JSON.stringify(payload).slice(0, 300)}`,
      );
      throw new Error('Payment auth failed.');
    }

    this.cachedToken = payload.token;
    const expiry = payload.expiryDate
      ? new Date(payload.expiryDate).getTime()
      : Date.now() + 5 * 60_000;
    this.tokenExpiresAt = Number.isFinite(expiry)
      ? expiry
      : Date.now() + 5 * 60_000;
    return payload.token;
  }

  async ensureIpnId(): Promise<string> {
    if (this.ipnId) return this.ipnId;

    const ipnUrl = this.ipnUrl();
    if (!ipnUrl) {
      throw new Error('Payment notification URL is missing.');
    }

    const token = await this.getAccessToken();

    // Prefer an already-registered active IPN for our URL.
    try {
      const listResponse = await fetch(
        `${this.baseUrl()}/api/URLSetup/GetIpnList`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const listPayload = (await listResponse.json()) as
        | PesapalIpnItem[]
        | { error?: { message?: string } };
      if (Array.isArray(listPayload)) {
        const match = listPayload.find(
          (item) =>
            item.url?.replace(/\/$/, '') === ipnUrl.replace(/\/$/, '') &&
            item.ipn_id &&
            (item.ipn_status === 1 ||
              item.ipn_status_decription?.toLowerCase() === 'active'),
        );
        if (match?.ipn_id) {
          this.ipnId = match.ipn_id;
          this.logger.log(`Pesapal IPN reused: ${this.ipnId}`);
          return this.ipnId;
        }
      }
    } catch (error) {
      this.logger.warn(
        `Pesapal GetIpnList failed: ${error instanceof Error ? error.message : error}`,
      );
    }

    const response = await fetch(
      `${this.baseUrl()}/api/URLSetup/RegisterIPN`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          url: ipnUrl,
          ipn_notification_type: 'GET',
        }),
      },
    );
    const payload = (await response.json()) as PesapalIpnResponse;
    if (!response.ok || !payload.ipn_id) {
      this.logger.warn(
        `Pesapal IPN register failed: ${JSON.stringify(payload).slice(0, 400)}`,
      );
      throw new Error('Could not register payment notifications.');
    }

    this.ipnId = payload.ipn_id;
    this.logger.log(`Pesapal IPN registered: ${this.ipnId}`);
    return this.ipnId;
  }

  async submitOrder(input: {
    id: string;
    currency: string;
    amount: number;
    description: string;
    callbackUrl: string;
    cancellationUrl?: string;
    branchName?: string;
    billingAddress: {
      email_address: string;
      phone_number?: string | null;
      country_code?: string;
      first_name?: string;
      last_name?: string;
    };
  }): Promise<PesapalSubmitOrderResponse> {
    const token = await this.getAccessToken();
    const notificationId = await this.ensureIpnId();

    // Pesapal: merchant ref max 50, alphanumeric + - _ . :
    const merchantId = input.id.replace(/[^a-zA-Z0-9._:-]/g, '_').slice(0, 50);
    const description = input.description.slice(0, 100);
    const amount = Math.round(Number(input.amount) * 100) / 100;

    const body: Record<string, unknown> = {
      id: merchantId,
      currency: input.currency,
      amount,
      description,
      callback_url: input.callbackUrl,
      redirect_mode: 'TOP_WINDOW',
      notification_id: notificationId,
      billing_address: {
        email_address: input.billingAddress.email_address,
        phone_number: this.normalizePhone(input.billingAddress.phone_number),
        country_code: input.billingAddress.country_code || 'UG',
        first_name: input.billingAddress.first_name || 'REMBEH',
        last_name: input.billingAddress.last_name || 'User',
      },
    };
    if (input.cancellationUrl) {
      body.cancellation_url = input.cancellationUrl;
    }
    if (input.branchName?.trim()) {
      body.branch = input.branchName.trim().slice(0, 80);
    }

    const response = await fetch(
      `${this.baseUrl()}/api/Transactions/SubmitOrderRequest`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      },
    );
    const payload = (await response.json()) as PesapalSubmitOrderResponse;
    if (!payload.redirect_url) {
      this.logger.warn(
        `Pesapal SubmitOrder failed status=${response.status} body=${JSON.stringify(payload).slice(0, 500)}`,
      );
      throw new Error(
        payload.error?.message ||
          payload.message ||
          'Payment could not be started.',
      );
    }
    return payload;
  }

  async getTransactionStatus(
    orderTrackingId: string,
  ): Promise<PesapalTransactionStatusResponse> {
    const token = await this.getAccessToken();
    const url = new URL(
      `${this.baseUrl()}/api/Transactions/GetTransactionStatus`,
    );
    url.searchParams.set('orderTrackingId', orderTrackingId);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    const payload =
      (await response.json()) as PesapalTransactionStatusResponse;
    if (!response.ok || payload.error?.message) {
      this.logger.warn(
        `Pesapal status failed: ${JSON.stringify(payload).slice(0, 400)}`,
      );
      throw new Error('Could not verify payment status.');
    }
    return payload;
  }

  private ipnUrl() {
    return (
      this.configService.get<string>('PESAPAL_IPN_URL')?.trim() ||
      (() => {
        const callback = this.configService
          .get<string>('PESAPAL_CALLBACK_URL')
          ?.trim();
        return callback
          ? callback.replace(/\/callback\/?(\?.*)?$/, '/ipn')
          : '';
      })()
    );
  }

  private normalizePhone(phone?: string | null) {
    if (!phone?.trim()) return undefined;
    const digits = phone.replace(/[^\d+]/g, '');
    return digits || undefined;
  }

  private consumerKey() {
    return this.configService.get<string>('PESAPAL_CONSUMER_KEY')?.trim() || '';
  }

  private consumerSecret() {
    return (
      this.configService.get<string>('PESAPAL_CONSUMER_SECRET')?.trim() || ''
    );
  }
}
