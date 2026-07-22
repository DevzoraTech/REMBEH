import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { buildStaffInvitationAcceptUrl } from '../../common/config/web-app-url';
import {
  EmailOtpDeliveryInput,
  EmailOtpDeliveryResult,
  PhoneOtpDeliveryInput,
  PhoneOtpDeliveryResult,
  StaffInvitationEmailInput,
  StaffInvitationEmailResult,
} from './notifications.contracts';
import { SmsService } from './sms.service';

const RESEND_EMAIL_ENDPOINT = 'https://api.resend.com/emails';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly smsService: SmsService,
  ) {}

  async sendEmailOtp(
    input: EmailOtpDeliveryInput,
  ): Promise<EmailOtpDeliveryResult> {
    const from = this.getEmailFromHeader();
    const apiKey = this.getResendApiKey();

    if (!apiKey) {
      return this.missingEmailConfigResult(from, input.destination, 'OTP');
    }

    const response = await this.sendResendEmail({
      apiKey,
      from,
      to: input.destination,
      subject: 'REMBEH verification code',
      text: this.buildOtpText(input),
      html: this.buildOtpHtml(input),
    });

    if (!response.ok) {
      const detail = await this.readResendError(response);
      this.logger.warn(`Email OTP send failed: ${detail}`);
      if (this.isProduction()) {
        throw new ServiceUnavailableException(
          'Verification email could not be sent. Please try again shortly.',
        );
      }
      return {
        channel: 'EMAIL',
        provider: 'resend',
        delivered: false,
        from,
        destination: input.destination,
        message: 'Email OTP could not be sent. Please try again.',
      };
    }

    return {
      channel: 'EMAIL',
      provider: 'resend',
      delivered: true,
      from,
      destination: input.destination,
      message: 'Email OTP sent.',
    };
  }

  async sendPhoneOtp(
    input: PhoneOtpDeliveryInput,
  ): Promise<PhoneOtpDeliveryResult> {
    const body = `Your REMBEH verification code is ${input.code}. It expires at ${input.expiresAt.toISOString()}.`;
    const sms = await this.smsService.sendText({
      destination: input.destination,
      body,
    });
    const devCode = this.canUsePhoneDevelopmentOtp() ? input.code : undefined;

    return {
      channel: 'PHONE',
      provider: sms.delivered ? sms.provider : 'development',
      delivered: sms.delivered,
      destination: input.destination,
      devCode,
      message: sms.delivered
        ? sms.message
        : 'SMS delivery is not configured, so this phone OTP is shown only in development.',
    };
  }

  async sendStaffInvitationEmail(
    input: StaffInvitationEmailInput,
  ): Promise<StaffInvitationEmailResult> {
    const from = this.getEmailFromHeader();
    const apiKey = this.getResendApiKey();

    if (!apiKey) {
      return this.missingEmailConfigResult(
        from,
        input.destination,
        'invitation',
      );
    }

    const response = await this.sendResendEmail({
      apiKey,
      from,
      to: input.destination,
      subject: `REMBEH invitation — ${input.workspaceName}`,
      text: this.buildStaffInvitationText(input),
      html: this.buildStaffInvitationHtml(input),
    });

    if (!response.ok) {
      const detail = await this.readResendError(response);
      this.logger.warn(`Invitation email send failed: ${detail}`);
      if (this.isProduction()) {
        throw new ServiceUnavailableException(
          'Invitation email could not be sent. Check RESEND_API_KEY and domain DNS (SPF/DKIM).',
        );
      }
      return {
        channel: 'EMAIL',
        provider: 'resend',
        delivered: false,
        from,
        destination: input.destination,
        message: 'Invitation email could not be sent. Please try again.',
      };
    }

    return {
      channel: 'EMAIL',
      provider: 'resend',
      delivered: true,
      from,
      destination: input.destination,
      message: 'Invitation email sent.',
    };
  }

  private missingEmailConfigResult(
    from: string,
    destination: string,
    kind: 'OTP' | 'invitation',
  ): EmailOtpDeliveryResult {
    const message =
      kind === 'invitation'
        ? 'Invitation email delivery is not configured.'
        : 'Email delivery is not configured.';

    if (this.isProduction()) {
      throw new ServiceUnavailableException(
        `${message} Set RESEND_API_KEY and EMAIL_FROM (or OTP_EMAIL_FROM) on the API host.`,
      );
    }

    this.logger.warn(`${message} (development stub — not delivered)`);
    return {
      channel: 'EMAIL',
      provider: 'development',
      delivered: false,
      from,
      destination,
      message,
    };
  }

  private sendResendEmail(input: {
    apiKey: string;
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }) {
    return fetch(RESEND_EMAIL_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: input.from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
    });
  }

  private async readResendError(response: Response): Promise<string> {
    try {
      const body = (await response.json()) as { message?: string };
      return body.message || `HTTP ${response.status}`;
    } catch {
      return `HTTP ${response.status}`;
    }
  }

  private getResendApiKey(): string | undefined {
    return (
      this.configService.get<string>('RESEND_API_KEY')?.trim() || undefined
    );
  }

  /** Resend-style "Name <email@domain>" when EMAIL_FROM_NAME is set. */
  private getEmailFromHeader(): string {
    const email =
      this.configService.get<string>('OTP_EMAIL_FROM')?.trim() ||
      this.configService.get<string>('EMAIL_FROM')?.trim() ||
      'auth@antikra.com';
    const name =
      this.configService.get<string>('EMAIL_FROM_NAME')?.trim() || 'REMBEH';

    if (email.includes('<')) {
      return email;
    }
    return `${name} <${email}>`;
  }

  private isProduction(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }

  private canUsePhoneDevelopmentOtp(): boolean {
    return (
      !this.isProduction() &&
      this.configService.get<string>('AUTH_PHONE_OTP_DEV_MODE') === 'true'
    );
  }

  private buildInvitationUrl(token: string): string {
    return buildStaffInvitationAcceptUrl(this.configService, token);
  }

  private buildOtpText(input: EmailOtpDeliveryInput): string {
    return [
      'REMBEH verification',
      '',
      `Your verification code is ${input.code}.`,
      `It expires at ${input.expiresAt.toISOString()}.`,
      '',
      'If you did not request this code, you can ignore this email.',
      '',
      '— REMBEH by Antikra',
    ].join('\n');
  }

  private buildOtpHtml(input: EmailOtpDeliveryInput): string {
    return [
      '<div style="font-family:Arial,Helvetica,sans-serif;color:#14213d;line-height:1.5;max-width:520px">',
      '<p style="margin:0 0 4px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#0f8a6c">REMBEH</p>',
      '<h1 style="font-size:20px;margin:0 0 12px">Verification code</h1>',
      '<p style="margin:0 0 12px">Use this code to finish email verification for your workspace.</p>',
      `<p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:0 0 12px">${input.code}</p>`,
      `<p style="margin:0 0 16px;color:#52606d;font-size:13px">Expires at ${input.expiresAt.toISOString()}.</p>`,
      '<p style="margin:0;color:#52606d;font-size:12px">If you did not request this, ignore this email.</p>',
      '</div>',
    ].join('');
  }

  private buildStaffInvitationText(input: StaffInvitationEmailInput): string {
    const invitationUrl = this.buildInvitationUrl(input.token);

    return [
      `Hello,`,
      '',
      `${input.invitedByName} invited you to join ${input.workspaceName} on REMBEH as ${input.roleName}.`,
      `Branch: ${input.branchName}.`,
      '',
      `Accept the invitation and set your password:`,
      invitationUrl,
      '',
      `This invitation expires at ${input.expiresAt.toISOString()}.`,
      '',
      'If you were not expecting this email, you can ignore it.',
      '',
      '— REMBEH by Antikra',
    ].join('\n');
  }

  private buildStaffInvitationHtml(input: StaffInvitationEmailInput): string {
    const invitationUrl = this.buildInvitationUrl(input.token);

    return [
      '<div style="font-family:Arial,Helvetica,sans-serif;color:#14213d;line-height:1.5;max-width:520px">',
      '<p style="margin:0 0 4px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#0f8a6c">REMBEH</p>',
      `<h1 style="font-size:20px;margin:0 0 12px">Join ${input.workspaceName}</h1>`,
      `<p style="margin:0 0 12px">${input.invitedByName} invited you as <strong>${input.roleName}</strong> for <strong>${input.branchName}</strong>.</p>`,
      `<p style="margin:0 0 16px"><a href="${invitationUrl}" style="display:inline-block;background:#0f8a6c;color:#ffffff;padding:12px 18px;text-decoration:none;font-weight:700">Accept invitation</a></p>`,
      `<p style="margin:0 0 8px;font-size:13px;color:#52606d">Or open this link:<br/><a href="${invitationUrl}" style="color:#0f8a6c;word-break:break-all">${invitationUrl}</a></p>`,
      `<p style="margin:0 0 12px;color:#52606d;font-size:13px">Expires at ${input.expiresAt.toISOString()}.</p>`,
      '<p style="margin:0;color:#52606d;font-size:12px">If you were not expecting this email, you can ignore it.</p>',
      '</div>',
    ].join('');
  }
}
