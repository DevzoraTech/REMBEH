import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type SmsDeliveryResult = {
  provider: 'mock' | 'twilio' | 'africastalking';
  delivered: boolean;
  destination: string;
  message: string;
};

export type PaymentRecordedSmsInput = {
  destination: string;
  amountLabel: string;
  agentName: string;
  agentPublicId: string;
  companyName: string;
  paidAt: Date;
};

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendText(input: {
    destination: string;
    body: string;
  }): Promise<SmsDeliveryResult> {
    const provider = this.resolveProvider();
    const destination = input.destination.trim();

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

  private resolveProvider(): 'mock' | 'twilio' | 'africastalking' {
    const configured = (
      this.configService.get<string>('SMS_PROVIDER') ?? 'mock'
    )
      .trim()
      .toLowerCase();

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
      To: destination,
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
      to: destination,
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
