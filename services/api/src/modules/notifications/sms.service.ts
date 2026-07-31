import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type SmsProviderName =
  | 'mock'
  | 'twilio'
  | 'africastalking'
  | 'pahappa';

export type SmsDeliveryResult = {
  provider: SmsProviderName;
  delivered: boolean;
  destination: string;
  message: string;
  providerReference?: string;
};

export type PaymentRecordedSmsInput = {
  destination: string;
  amountLabel: string;
  agentName: string;
  agentPublicId: string;
  companyName: string;
  paidAt: Date;
};

/**
 * SMS providers:
 * - mock: log only (default / missing keys)
 * - pahappa: EgoSMS by Pahappa (JSON API) — primary for UG
 * - twilio / africastalking: optional fallbacks
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendText(input: {
    destination: string;
    body: string;
  }): Promise<SmsDeliveryResult> {
    const provider = this.resolveProvider();
    const destination = this.normalizeDestination(input.destination);

    if (!destination) {
      return {
        provider,
        delivered: false,
        destination: input.destination,
        message: 'Invalid SMS destination.',
      };
    }

    if (provider === 'pahappa') {
      return this.sendPahappa(destination, input.body);
    }
    if (provider === 'twilio') {
      return this.sendTwilio(destination, input.body);
    }
    if (provider === 'africastalking') {
      return this.sendAfricasTalking(destination, input.body);
    }

    this.logger.log(
      `[SMS mock] to=${destination} body=${JSON.stringify(input.body)}`,
    );
    return {
      provider: 'mock',
      delivered: false,
      destination,
      message: 'SMS stub logged (SMS_PROVIDER=mock or keys missing).',
    };
  }

  sendPaymentRecordedSms(
    input: PaymentRecordedSmsInput,
  ): Promise<SmsDeliveryResult> {
    const when = this.formatDateTime(input.paidAt);
    const body =
      `REMBEH payment recorded: ${input.amountLabel} by Agent ${input.agentName} ` +
      `(${input.agentPublicId}) at ${input.companyName} on ${when}. ` +
      `If incorrect, report fraud citing Agent ID ${input.agentPublicId}.`;

    return this.sendText({
      destination: input.destination,
      body,
    });
  }

  /** Account balance via Pahappa EgoSMS (useful for ops readiness checks). */
  async getPahappaBalance(): Promise<{
    ok: boolean;
    balance?: string;
    message: string;
  }> {
    if (!this.hasPahappaKeys()) {
      return { ok: false, message: 'Pahappa credentials are not configured.' };
    }

    const baseUrl = this.pahappaBaseUrl();
    const payload = {
      method: 'Balance',
      userdata: {
        username: this.configService.get<string>('PAHAPPA_USERNAME')!.trim(),
        password: this.pahappaPassword(),
      },
    };

    try {
      const response = await fetch(`${baseUrl}/json/`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const raw = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const status = String(raw.Status ?? raw.status ?? '').toUpperCase();
      if (!response.ok || (status && status !== 'OK')) {
        return {
          ok: false,
          message: String(raw.Message ?? raw.message ?? 'Balance check failed.'),
        };
      }
      return {
        ok: true,
        balance: String(raw.Balance ?? raw.balance ?? raw.Cost ?? ''),
        message: 'Balance retrieved.',
      };
    } catch (error) {
      this.logger.warn(`Pahappa balance error: ${String(error)}`);
      return { ok: false, message: 'Pahappa balance request failed.' };
    }
  }

  private resolveProvider(): SmsProviderName {
    const configured = (
      this.configService.get<string>('SMS_PROVIDER') ?? 'mock'
    )
      .trim()
      .toLowerCase();

    if (
      (configured === 'pahappa' || configured === 'egosms') &&
      this.hasPahappaKeys()
    ) {
      return 'pahappa';
    }
    if (configured === 'twilio' && this.hasTwilioKeys()) {
      return 'twilio';
    }
    if (configured === 'africastalking' && this.hasAfricasTalkingKeys()) {
      return 'africastalking';
    }
    return 'mock';
  }

  private hasTwilioKeys() {
    return Boolean(
      this.configService.get<string>('TWILIO_ACCOUNT_SID')?.trim() &&
        this.configService.get<string>('TWILIO_AUTH_TOKEN')?.trim() &&
        this.configService.get<string>('TWILIO_FROM_NUMBER')?.trim(),
    );
  }

  private hasAfricasTalkingKeys() {
    return Boolean(
      this.configService.get<string>('AFRICASTALKING_USERNAME')?.trim() &&
        this.configService.get<string>('AFRICASTALKING_API_KEY')?.trim(),
    );
  }

  private hasPahappaKeys() {
    return Boolean(
      this.configService.get<string>('PAHAPPA_USERNAME')?.trim() &&
        this.pahappaPassword() &&
        this.configService.get<string>('PAHAPPA_SENDER')?.trim(),
    );
  }

  /** Prefer API key; password accepted for older EgoSMS accounts. */
  private pahappaPassword() {
    return (
      this.configService.get<string>('PAHAPPA_API_KEY')?.trim() ||
      this.configService.get<string>('PAHAPPA_PASSWORD')?.trim() ||
      ''
    );
  }

  private pahappaBaseUrl() {
    const configured = this.configService
      .get<string>('PAHAPPA_BASE_URL')
      ?.trim()
      .replace(/\/$/, '');
    if (configured) return configured;
    const sandbox =
      this.configService.get<string>('PAHAPPA_SANDBOX')?.trim().toLowerCase() ===
      'true';
    return sandbox
      ? 'https://sandbox.egosms.co/api/v1'
      : 'https://www.egosms.co/api/v1';
  }

  private async sendPahappa(
    destination: string,
    body: string,
  ): Promise<SmsDeliveryResult> {
    const username = this.configService.get<string>('PAHAPPA_USERNAME')!.trim();
    const password = this.pahappaPassword();
    const sender = this.configService.get<string>('PAHAPPA_SENDER')!.trim();
    const priority =
      this.configService.get<string>('PAHAPPA_PRIORITY')?.trim() || '0';
    const number = this.toEgosmsNumber(destination);
    const message = body.slice(0, 480);

    const payload = {
      method: 'SendSms',
      userdata: { username, password },
      msgdata: [
        {
          number,
          message,
          senderid: sender.slice(0, 11),
          priority,
        },
      ],
    };

    try {
      const response = await fetch(`${this.pahappaBaseUrl()}/json/`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const raw = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const status = String(raw.Status ?? raw.status ?? '').toUpperCase();
      const reference = String(
        raw.MsgFollowUpUniqueCode ?? raw.msgFollowUpUniqueCode ?? '',
      );

      if (!response.ok || status !== 'OK') {
        const detail = String(
          raw.Message ?? raw.message ?? `HTTP ${response.status}`,
        );
        this.logger.warn(`Pahappa SMS failed: ${detail}`);
        return {
          provider: 'pahappa',
          delivered: false,
          destination,
          message: `Pahappa SMS could not be sent: ${detail}`,
        };
      }

      return {
        provider: 'pahappa',
        delivered: true,
        destination,
        message: 'SMS sent via Pahappa EgoSMS.',
        providerReference: reference || undefined,
      };
    } catch (error) {
      this.logger.warn(`Pahappa SMS error: ${String(error)}`);
      return {
        provider: 'pahappa',
        delivered: false,
        destination,
        message: 'Pahappa SMS request failed.',
      };
    }
  }

  private async sendTwilio(
    destination: string,
    body: string,
  ): Promise<SmsDeliveryResult> {
    const accountSid = this.configService
      .get<string>('TWILIO_ACCOUNT_SID')!
      .trim();
    const authToken = this.configService
      .get<string>('TWILIO_AUTH_TOKEN')!
      .trim();
    const from = this.configService.get<string>('TWILIO_FROM_NUMBER')!.trim();
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const params = new URLSearchParams({
      To: destination.startsWith('+') ? destination : `+${destination}`,
      From: from,
      Body: body,
    });

    try {
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        },
      );
      if (!response.ok) {
        const text = await response.text();
        this.logger.warn(`Twilio SMS failed: ${response.status} ${text}`);
        return {
          provider: 'twilio',
          delivered: false,
          destination,
          message: 'Twilio SMS could not be sent.',
        };
      }
      return {
        provider: 'twilio',
        delivered: true,
        destination,
        message: 'SMS sent via Twilio.',
      };
    } catch (error) {
      this.logger.warn(`Twilio SMS error: ${String(error)}`);
      return {
        provider: 'twilio',
        delivered: false,
        destination,
        message: 'Twilio SMS request failed.',
      };
    }
  }

  private async sendAfricasTalking(
    destination: string,
    body: string,
  ): Promise<SmsDeliveryResult> {
    const username = this.configService
      .get<string>('AFRICASTALKING_USERNAME')!
      .trim();
    const apiKey = this.configService
      .get<string>('AFRICASTALKING_API_KEY')!
      .trim();
    const from =
      this.configService.get<string>('AFRICASTALKING_FROM')?.trim() ||
      undefined;

    const params = new URLSearchParams({
      username,
      to: destination.startsWith('+') ? destination : `+${destination}`,
      message: body,
    });
    if (from) params.set('from', from);

    try {
      const response = await fetch(
        'https://api.africastalking.com/version1/messaging',
        {
          method: 'POST',
          headers: {
            apiKey,
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        },
      );
      if (!response.ok) {
        const text = await response.text();
        this.logger.warn(
          `Africa's Talking SMS failed: ${response.status} ${text}`,
        );
        return {
          provider: 'africastalking',
          delivered: false,
          destination,
          message: "Africa's Talking SMS could not be sent.",
        };
      }
      return {
        provider: 'africastalking',
        delivered: true,
        destination,
        message: "SMS sent via Africa's Talking.",
      };
    } catch (error) {
      this.logger.warn(`Africa's Talking SMS error: ${String(error)}`);
      return {
        provider: 'africastalking',
        delivered: false,
        destination,
        message: "Africa's Talking SMS request failed.",
      };
    }
  }

  private normalizeDestination(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return '';
    const digits = trimmed.replace(/[^\d+]/g, '');
    if (digits.startsWith('+')) return digits;
    if (digits.startsWith('00')) return `+${digits.slice(2)}`;
    if (digits.startsWith('0') && digits.length >= 9) {
      return `+256${digits.slice(1)}`;
    }
    if (digits.startsWith('256')) return `+${digits}`;
    return digits.startsWith('+') ? digits : `+${digits}`;
  }

  /** EgoSMS expects 2567… without a leading +. */
  private toEgosmsNumber(e164OrLocal: string) {
    const digits = e164OrLocal.replace(/\D/g, '');
    if (digits.startsWith('256')) return digits;
    if (digits.startsWith('0') && digits.length >= 9) {
      return `256${digits.slice(1)}`;
    }
    return digits;
  }

  private formatDateTime(value: Date): string {
    try {
      return new Intl.DateTimeFormat('en-UG', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(value);
    } catch {
      return value.toISOString();
    }
  }
}
