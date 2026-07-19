import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmailOtpDeliveryInput,
  EmailOtpDeliveryResult,
  PhoneOtpDeliveryInput,
  PhoneOtpDeliveryResult,
  StaffInvitationEmailInput,
  StaffInvitationEmailResult,
} from './notifications.contracts';

const RESEND_EMAIL_ENDPOINT = 'https://api.resend.com/emails';

@Injectable()
export class NotificationsService {
  constructor(private readonly configService: ConfigService) {}

  async sendEmailOtp(
    input: EmailOtpDeliveryInput,
  ): Promise<EmailOtpDeliveryResult> {
    const from = this.getEmailOtpSender();
    const apiKey = this.configService.get<string>('RESEND_API_KEY')?.trim();

    if (!apiKey) {
      return {
        channel: 'EMAIL',
        provider: 'development',
        delivered: false,
        from,
        destination: input.destination,
        message: 'Email delivery is not configured.',
      };
    }

    const response = await this.sendResendEmail({
      apiKey,
      from,
      to: input.destination,
      subject: 'Your REMBEH verification code',
      text: this.buildOtpText(input),
      html: this.buildOtpHtml(input),
    });

    if (!response.ok) {
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

  sendPhoneOtp(input: PhoneOtpDeliveryInput): Promise<PhoneOtpDeliveryResult> {
    const devCode = this.canUsePhoneDevelopmentOtp() ? input.code : undefined;

    return Promise.resolve({
      channel: 'PHONE',
      provider: 'development',
      delivered: false,
      destination: input.destination,
      devCode,
      message:
        'SMS delivery is not configured, so this phone OTP is shown only in development.',
    });
  }

  async sendStaffInvitationEmail(
    input: StaffInvitationEmailInput,
  ): Promise<StaffInvitationEmailResult> {
    const from = this.getEmailOtpSender();
    const apiKey = this.configService.get<string>('RESEND_API_KEY')?.trim();

    if (!apiKey) {
      return {
        channel: 'EMAIL',
        provider: 'development',
        delivered: false,
        from,
        destination: input.destination,
        message: 'Invitation email delivery is not configured.',
      };
    }

    const response = await this.sendResendEmail({
      apiKey,
      from,
      to: input.destination,
      subject: `You have been invited to ${input.workspaceName}`,
      text: this.buildStaffInvitationText(input),
      html: this.buildStaffInvitationHtml(input),
    });

    if (!response.ok) {
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

  private getEmailOtpSender(): string {
    return (
      this.configService.get<string>('OTP_EMAIL_FROM')?.trim() ||
      this.configService.get<string>('EMAIL_FROM')?.trim() ||
      'auth@antikra.com'
    );
  }

  private canUsePhoneDevelopmentOtp(): boolean {
    return (
      this.configService.get<string>('NODE_ENV') !== 'production' &&
      this.configService.get<string>('AUTH_PHONE_OTP_DEV_MODE') === 'true'
    );
  }

  private buildInvitationUrl(token: string): string {
    const baseUrl =
      this.configService.get<string>('WEB_APP_URL')?.trim() ||
      'http://localhost:3000';
    const url = new URL('/staff-invitations/accept', baseUrl);
    url.searchParams.set('token', token);

    return url.toString();
  }

  private buildOtpText(input: EmailOtpDeliveryInput): string {
    return [
      `Your REMBEH verification code is ${input.code}.`,
      `It expires at ${input.expiresAt.toISOString()}.`,
      'If you did not request this code, ignore this email.',
    ].join('\n');
  }

  private buildOtpHtml(input: EmailOtpDeliveryInput): string {
    return [
      '<div style="font-family:Arial,sans-serif;color:#14213d;line-height:1.5">',
      '<h1 style="font-size:20px;margin:0 0 12px">Verify your REMBEH account</h1>',
      '<p style="margin:0 0 12px">Use this code to finish owner email verification.</p>',
      `<p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:0 0 12px">${input.code}</p>`,
      `<p style="margin:0;color:#52606d">Expires at ${input.expiresAt.toISOString()}.</p>`,
      '</div>',
    ].join('');
  }

  private buildStaffInvitationText(input: StaffInvitationEmailInput): string {
    const invitationUrl = this.buildInvitationUrl(input.token);

    return [
      `${input.invitedByName} invited you to join ${input.workspaceName} as ${input.roleName}.`,
      `Branch: ${input.branchName}.`,
      `Accept the invitation and create your password: ${invitationUrl}`,
      `This invitation expires at ${input.expiresAt.toISOString()}.`,
    ].join('\n');
  }

  private buildStaffInvitationHtml(input: StaffInvitationEmailInput): string {
    const invitationUrl = this.buildInvitationUrl(input.token);

    return [
      '<div style="font-family:Arial,sans-serif;color:#14213d;line-height:1.5">',
      `<h1 style="font-size:20px;margin:0 0 12px">Join ${input.workspaceName}</h1>`,
      `<p style="margin:0 0 12px">${input.invitedByName} invited you as <strong>${input.roleName}</strong> for <strong>${input.branchName}</strong>.</p>`,
      `<p style="margin:0 0 16px"><a href="${invitationUrl}" style="background:#0f8a6c;color:white;padding:10px 14px;border-radius:6px;text-decoration:none;font-weight:700">Accept invitation</a></p>`,
      `<p style="margin:0;color:#52606d">Expires at ${input.expiresAt.toISOString()}.</p>`,
      '</div>',
    ].join('');
  }
}
