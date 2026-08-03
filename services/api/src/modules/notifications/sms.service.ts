import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { evaluatePahappaImmediateResponse } from './pahappa-response';

export type SmsProviderName =
  | 'mock'
  | 'twilio'
  | 'africastalking'
  | 'pahappa';

/** Immediate provider response classification (Step 7). */
export type SmsProviderOutcome =
  | 'accepted'
  | 'rejected'
  | 'ambiguous'
  | 'skipped';

/** Non-sensitive provider call audit fields (never include credentials). */
export type SmsProviderRequestLogPayload = {
  requestTime: string;
  providerEndpoint: string;
  requestReference: string;
  requestMetadata: Record<string, unknown>;
  responseCode: string | null;
  providerMessageId: string | null;
  responseTimeMs: number;
  outcome: SmsProviderOutcome;
};

export type SmsDeliveryResult = {
  provider: SmsProviderName;
  /** True only on definite provider acceptance. */
  delivered: boolean;
  outcome: SmsProviderOutcome;
  destination: string;
  message: string;
  providerReference?: string;
  /** Stable rejection reason when outcome === 'rejected'. */
  failureReason?: string;
  providerLog?: SmsProviderRequestLogPayload;
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
    /** Correlates provider logs with sms_messages.id when available. */
    requestReference?: string;
  }): Promise<SmsDeliveryResult> {
    const provider = this.resolveProvider();
    const destination = this.normalizeDestination(input.destination);

    if (!destination) {
      return {
        provider,
        delivered: false,
        outcome: 'skipped',
        destination: input.destination,
        message: 'Invalid SMS destination.',
      };
    }

    if (provider === 'pahappa') {
      return this.sendPahappa(destination, input.body, input.requestReference);
    }
    if (provider === 'twilio') {
      return this.sendTwilio(destination, input.body, input.requestReference);
    }
    if (provider === 'africastalking') {
      return this.sendAfricasTalking(
        destination,
        input.body,
        input.requestReference,
      );
    }

    this.logger.log(
      `[SMS mock] to=${destination} body=${JSON.stringify(input.body)}`,
    );
    return {
      provider: 'mock',
      delivered: false,
      outcome: 'skipped',
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

    const baseUrl = this.pahappaApiUrl();
    const payload = {
      method: 'Balance',
      userdata: {
        username:
          this.configService.get<string>('PAHAPPA_USERNAME')?.trim() ||
          this.configService.get<string>('EGOSMS_USERNAME')!.trim(),
        password: this.pahappaPassword(),
      },
    };

    try {
      const response = await fetch(baseUrl, {
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
      (configured === 'pahappa' ||
        configured === 'egosms' ||
        configured === 'auto') &&
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
      (
        this.configService.get<string>('PAHAPPA_USERNAME')?.trim() ||
        this.configService.get<string>('EGOSMS_USERNAME')?.trim()
      ) &&
        this.pahappaPassword() &&
        (
          this.configService.get<string>('PAHAPPA_SENDER')?.trim() ||
          this.configService.get<string>('EGOSMS_SENDER')?.trim()
        ),
    );
  }

  /** Prefer API key; password accepted for older EgoSMS accounts. */
  private pahappaPassword() {
    return (
      this.configService.get<string>('PAHAPPA_API_KEY')?.trim() ||
      this.configService.get<string>('PAHAPPA_PASSWORD')?.trim() ||
      this.configService.get<string>('EGOSMS_PASSWORD')?.trim() ||
      ''
    );
  }

  private pahappaApiUrl() {
    const configured =
      this.configService.get<string>('PAHAPPA_BASE_URL')?.trim() ||
      this.configService.get<string>('EGOSMS_API_URL')?.trim() ||
      this.configService.get<string>('PAHAPPA_SMS_API_URL')?.trim() ||
      '';
    if (configured) {
      const cleaned = configured.replace(/\/$/, '');
      if (/\/json$/i.test(cleaned) || /\/json\/$/i.test(configured)) {
        return cleaned.endsWith('/') ? cleaned : `${cleaned}/`;
      }
      return `${cleaned}/json/`;
    }
    const sandbox =
      this.configService.get<string>('PAHAPPA_SANDBOX')?.trim().toLowerCase() ===
        'true' ||
      this.configService.get<string>('EGOSMS_SANDBOX')?.trim().toLowerCase() ===
        'true';
    // Match Carmie EgoSMS / Pahappa production endpoint.
    return sandbox
      ? 'http://sandbox.egosms.co/api/v1/json/'
      : 'https://comms.egosms.co/api/v1/json/';
  }

  private async sendPahappa(
    destination: string,
    body: string,
    requestReference?: string,
  ): Promise<SmsDeliveryResult> {
    const username =
      this.configService.get<string>('PAHAPPA_USERNAME')?.trim() ||
      this.configService.get<string>('EGOSMS_USERNAME')?.trim() ||
      '';
    const password = this.pahappaPassword();
    const sender =
      this.configService.get<string>('PAHAPPA_SENDER')?.trim() ||
      this.configService.get<string>('EGOSMS_SENDER')?.trim() ||
      'REMBEH';
    const priority =
      this.configService.get<string>('PAHAPPA_PRIORITY')?.trim() || '0';
    const number = this.toEgosmsNumber(destination);
    const message = body.slice(0, 480);
    const apiUrl = this.pahappaApiUrl();
    const reference =
      requestReference?.trim() || `sms_${randomUUID().replaceAll('-', '')}`;
    const requestTime = new Date();
    const startedAt = Date.now();

    // Credentials are sent to the provider but never written to logs.
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

    const requestMetadata: Record<string, unknown> = {
      method: 'SendSms',
      destinationMsisdn: number,
      senderId: sender.slice(0, 11),
      priority,
      characterCount: message.length,
      hasCredentials: Boolean(username && password),
    };

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const responseTimeMs = Date.now() - startedAt;
      const rawText = await response.text();
      let raw: Record<string, unknown> = {};
      try {
        raw = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        const providerLog = this.buildProviderLog({
          requestTime,
          providerEndpoint: apiUrl,
          requestReference: reference,
          requestMetadata,
          responseCode: `HTTP_${response.status}`,
          providerMessageId: null,
          responseTimeMs,
          outcome: 'ambiguous',
        });
        this.writeProviderAuditLog(providerLog);
        return {
          provider: 'pahappa',
          delivered: false,
          outcome: 'ambiguous',
          destination,
          message: 'Pahappa SMS returned an invalid response.',
          providerLog,
        };
      }

      const status = String(raw.Status ?? raw.status ?? '').toUpperCase();
      const providerMessageId =
        String(
          raw.MsgFollowUpUniqueCode ??
            raw.msgFollowUpUniqueCode ??
            raw.MessageId ??
            raw.messageId ??
            '',
        ).trim() || null;
      const providerDetail = String(
        raw.Message ?? raw.message ?? `HTTP ${response.status}`,
      );

      // Step 7 — evaluate immediate provider response.
      const evaluation = evaluatePahappaImmediateResponse({
        httpOk: response.ok,
        status,
        providerMessageId,
        providerDetail,
      });

      if (evaluation.outcome === 'accepted') {
        const providerLog = this.buildProviderLog({
          requestTime,
          providerEndpoint: apiUrl,
          requestReference: reference,
          requestMetadata,
          responseCode: status || `HTTP_${response.status}`,
          providerMessageId,
          responseTimeMs,
          outcome: 'accepted',
        });
        this.writeProviderAuditLog(providerLog);
        return {
          provider: 'pahappa',
          delivered: true,
          outcome: 'accepted',
          destination,
          message: 'SMS accepted by Pahappa EgoSMS.',
          providerReference: providerMessageId ?? undefined,
          providerLog,
        };
      }

      const outcome = evaluation.outcome;
      const failureReason =
        evaluation.outcome === 'rejected'
          ? evaluation.reason
          : 'provider_ambiguous';
      const providerLog = this.buildProviderLog({
        requestTime,
        providerEndpoint: apiUrl,
        requestReference: reference,
        requestMetadata: {
          ...requestMetadata,
          providerDetail: providerDetail.slice(0, 240),
          failureReason,
        },
        responseCode: status || `HTTP_${response.status}`,
        providerMessageId,
        responseTimeMs,
        outcome,
      });
      this.writeProviderAuditLog(providerLog);
      return {
        provider: 'pahappa',
        delivered: false,
        outcome,
        destination,
        message: `Pahappa SMS could not be sent: ${providerDetail}`,
        providerReference: providerMessageId ?? undefined,
        failureReason,
        providerLog,
      };
    } catch (error) {
      const responseTimeMs = Date.now() - startedAt;
      const providerLog = this.buildProviderLog({
        requestTime,
        providerEndpoint: apiUrl,
        requestReference: reference,
        requestMetadata: {
          ...requestMetadata,
          error: error instanceof Error ? error.name : 'request_failed',
        },
        responseCode: null,
        providerMessageId: null,
        responseTimeMs,
        outcome: 'ambiguous',
      });
      this.writeProviderAuditLog(providerLog);
      return {
        provider: 'pahappa',
        delivered: false,
        outcome: 'ambiguous',
        destination,
        message: 'Pahappa SMS request failed.',
        providerLog,
      };
    }
  }

  private buildProviderLog(input: {
    requestTime: Date;
    providerEndpoint: string;
    requestReference: string;
    requestMetadata: Record<string, unknown>;
    responseCode: string | null;
    providerMessageId: string | null;
    responseTimeMs: number;
    outcome: SmsProviderOutcome;
  }): SmsProviderRequestLogPayload {
    return {
      requestTime: input.requestTime.toISOString(),
      providerEndpoint: input.providerEndpoint,
      requestReference: input.requestReference,
      requestMetadata: input.requestMetadata,
      responseCode: input.responseCode,
      providerMessageId: input.providerMessageId,
      responseTimeMs: input.responseTimeMs,
      outcome: input.outcome,
    };
  }

  /** Console audit only — never includes passwords/API keys. */
  private writeProviderAuditLog(log: SmsProviderRequestLogPayload) {
    this.logger.log(
      JSON.stringify({
        type: 'sms_provider_request',
        requestTime: log.requestTime,
        providerEndpoint: log.providerEndpoint,
        requestReference: log.requestReference,
        requestMetadata: log.requestMetadata,
        responseCode: log.responseCode,
        providerMessageId: log.providerMessageId,
        responseTimeMs: log.responseTimeMs,
        outcome: log.outcome,
      }),
    );
  }

  private async sendTwilio(
    destination: string,
    body: string,
    requestReference?: string,
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
    const reference =
      requestReference?.trim() || `sms_${randomUUID().replaceAll('-', '')}`;
    const requestTime = new Date();
    const startedAt = Date.now();
    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });
      const responseTimeMs = Date.now() - startedAt;
      if (!response.ok) {
        const providerLog = this.buildProviderLog({
          requestTime,
          providerEndpoint: endpoint,
          requestReference: reference,
          requestMetadata: {
            method: 'Messages.create',
            destinationMsisdn: destination,
            from,
          },
          responseCode: `HTTP_${response.status}`,
          providerMessageId: null,
          responseTimeMs,
          outcome: 'rejected',
        });
        this.writeProviderAuditLog(providerLog);
        return {
          provider: 'twilio',
          delivered: false,
          outcome: 'rejected',
          destination,
          message: 'Twilio SMS could not be sent.',
          providerLog,
        };
      }
      const raw = (await response.json().catch(() => ({}))) as {
        sid?: string;
      };
      const providerLog = this.buildProviderLog({
        requestTime,
        providerEndpoint: endpoint,
        requestReference: reference,
        requestMetadata: {
          method: 'Messages.create',
          destinationMsisdn: destination,
          from,
        },
        responseCode: `HTTP_${response.status}`,
        providerMessageId: raw.sid ?? null,
        responseTimeMs,
        outcome: 'accepted',
      });
      this.writeProviderAuditLog(providerLog);
      return {
        provider: 'twilio',
        delivered: true,
        outcome: 'accepted',
        destination,
        message: 'SMS accepted by Twilio.',
        providerReference: raw.sid,
        providerLog,
      };
    } catch (error) {
      const providerLog = this.buildProviderLog({
        requestTime,
        providerEndpoint: endpoint,
        requestReference: reference,
        requestMetadata: {
          method: 'Messages.create',
          destinationMsisdn: destination,
          error: error instanceof Error ? error.name : 'request_failed',
        },
        responseCode: null,
        providerMessageId: null,
        responseTimeMs: Date.now() - startedAt,
        outcome: 'ambiguous',
      });
      this.writeProviderAuditLog(providerLog);
      return {
        provider: 'twilio',
        delivered: false,
        outcome: 'ambiguous',
        destination,
        message: 'Twilio SMS request failed.',
        providerLog,
      };
    }
  }

  private async sendAfricasTalking(
    destination: string,
    body: string,
    requestReference?: string,
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

    const reference =
      requestReference?.trim() || `sms_${randomUUID().replaceAll('-', '')}`;
    const requestTime = new Date();
    const startedAt = Date.now();
    const endpoint = 'https://api.africastalking.com/version1/messaging';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          apiKey,
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });
      const responseTimeMs = Date.now() - startedAt;
      if (!response.ok) {
        const providerLog = this.buildProviderLog({
          requestTime,
          providerEndpoint: endpoint,
          requestReference: reference,
          requestMetadata: {
            method: 'messaging',
            destinationMsisdn: destination,
            from: from ?? null,
          },
          responseCode: `HTTP_${response.status}`,
          providerMessageId: null,
          responseTimeMs,
          outcome: 'rejected',
        });
        this.writeProviderAuditLog(providerLog);
        return {
          provider: 'africastalking',
          delivered: false,
          outcome: 'rejected',
          destination,
          message: "Africa's Talking SMS could not be sent.",
          providerLog,
        };
      }
      const providerLog = this.buildProviderLog({
        requestTime,
        providerEndpoint: endpoint,
        requestReference: reference,
        requestMetadata: {
          method: 'messaging',
          destinationMsisdn: destination,
          from: from ?? null,
        },
        responseCode: `HTTP_${response.status}`,
        providerMessageId: null,
        responseTimeMs,
        outcome: 'accepted',
      });
      this.writeProviderAuditLog(providerLog);
      return {
        provider: 'africastalking',
        delivered: true,
        outcome: 'accepted',
        destination,
        message: "SMS accepted by Africa's Talking.",
        providerLog,
      };
    } catch (error) {
      const providerLog = this.buildProviderLog({
        requestTime,
        providerEndpoint: endpoint,
        requestReference: reference,
        requestMetadata: {
          method: 'messaging',
          destinationMsisdn: destination,
          error: error instanceof Error ? error.name : 'request_failed',
        },
        responseCode: null,
        providerMessageId: null,
        responseTimeMs: Date.now() - startedAt,
        outcome: 'ambiguous',
      });
      this.writeProviderAuditLog(providerLog);
      return {
        provider: 'africastalking',
        delivered: false,
        outcome: 'ambiguous',
        destination,
        message: "Africa's Talking SMS request failed.",
        providerLog,
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
