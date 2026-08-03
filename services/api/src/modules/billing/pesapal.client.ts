import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type PesapalTokenResponse = {
  token?: string;
  expiryDate?: string;
  error?: { message?: string; code?: string };
  status?: string;
  message?: string;
};

type PesapalIpnResponse = {
  ipn_id?: string;
  url?: string;
  error?: { message?: string };
  status?: string;
  message?: string;
};

type PesapalSubmitOrderResponse = {
  order_tracking_id?: string;
  merchant_reference?: string;
  redirect_url?: string;
  error?: { message?: string; code?: string };
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
      throw new Error(
        payload.error?.message ||
          payload.message ||
          `Pesapal auth failed (${response.status})`,
      );
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

    const ipnUrl =
      this.configService.get<string>('PESAPAL_IPN_URL')?.trim() ||
      (() => {
        const callback = this.configService
          .get<string>('PESAPAL_CALLBACK_URL')
          ?.trim();
        return callback
          ? callback.replace(/\/callback\/?(\?.*)?$/, '/ipn')
          : '';
      })();
    if (!ipnUrl) {
      throw new Error(
        'PESAPAL_IPN_URL or PESAPAL_CALLBACK_URL is required to register IPN.',
      );
    }

    const token = await this.getAccessToken();
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
        `Pesapal IPN register failed: ${payload.error?.message || payload.message || response.status}`,
      );
      throw new Error(
        payload.error?.message ||
          payload.message ||
          'Could not register Pesapal IPN.',
      );
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

    const response = await fetch(
      `${this.baseUrl()}/api/Transactions/SubmitOrderRequest`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: input.id,
          currency: input.currency,
          amount: input.amount,
          description: input.description,
          callback_url: input.callbackUrl,
          notification_id: notificationId,
          billing_address: {
            email_address: input.billingAddress.email_address,
            phone_number: input.billingAddress.phone_number || undefined,
            country_code: input.billingAddress.country_code || 'UG',
            first_name: input.billingAddress.first_name || 'REMBEH',
            last_name: input.billingAddress.last_name || 'Owner',
          },
        }),
      },
    );
    const payload = (await response.json()) as PesapalSubmitOrderResponse;
    const errorMessage =
      payload.error?.message ||
      payload.message ||
      (!response.ok ? `Pesapal submit order failed (${response.status})` : '');
    if (!response.ok || !payload.redirect_url) {
      this.logger.warn(
        `Pesapal SubmitOrder failed status=${response.status} body=${JSON.stringify(payload).slice(0, 500)}`,
      );
      throw new Error(errorMessage || 'Pesapal submit order failed.');
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
    if (!response.ok) {
      throw new Error(
        payload.error?.message ||
          payload.message ||
          `Pesapal status failed (${response.status})`,
      );
    }
    return payload;
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
