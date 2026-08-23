import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  buildStaffInvitationAcceptUrl,
  buildWebAppUrl,
  resolveWebAppBaseUrl,
} from '../../common/config/web-app-url';
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
const RESEND_RECEIVED_EMAIL_ENDPOINT =
  'https://api.resend.com/emails/receiving';

type RembehEmailCategory =
  'auth' | 'billing' | 'marketing' | 'operations' | 'support';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly smsService: SmsService,
  ) {}

  async sendControlCenterEmail(input: {
    to: string | string[];
    subject: string;
    text: string;
    html?: string;
    replyTo?: string;
    category?: RembehEmailCategory;
  }): Promise<{ delivered: boolean; provider: 'resend'; error?: string }> {
    const from = this.getEmailFromHeader(input.category ?? 'marketing');
    const apiKey = this.getResendApiKey();

    if (!apiKey) {
      const message = 'Email skipped because Resend is not configured.';
      this.logger.warn(message);
      return { delivered: false, provider: 'resend', error: message };
    }

    const response = await this.sendResendEmail({
      apiKey,
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html ?? this.plainTextHtml(input.text),
      replyTo: input.replyTo,
    });

    if (!response.ok) {
      const detail = await this.readResendError(response);
      this.logger.warn(`Control center email failed: ${detail}`);
      return { delivered: false, provider: 'resend', error: detail };
    }

    return { delivered: true, provider: 'resend' };
  }

  async sendEmailOtp(
    input: EmailOtpDeliveryInput,
  ): Promise<EmailOtpDeliveryResult> {
    const from = this.getEmailFromHeader('auth');
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
    const from = this.getEmailFromHeader('auth');
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

  /** User receipt after SMS bundle credits land. */
  async sendSmsPurchaseReceiptEmail(input: {
    destination: string;
    payerName: string;
    branchName: string;
    bundleName: string;
    amountUgx: number;
    smsUnits: number;
    newBalance: number;
    reference: string;
  }): Promise<{ delivered: boolean }> {
    const from = this.getEmailFromHeader('billing');
    const apiKey = this.getResendApiKey();
    if (!apiKey) {
      this.logger.warn('SMS receipt email skipped — Resend not configured.');
      return { delivered: false };
    }

    const amountLabel = `UGX ${input.amountUgx.toLocaleString('en-UG')}`;
    const unitsLabel = input.smsUnits.toLocaleString('en-UG');
    const balanceLabel = input.newBalance.toLocaleString('en-UG');
    const ref = input.reference.slice(-8).toUpperCase();

    const text = [
      `Hello ${input.payerName},`,
      '',
      `Your REMBEH SMS purchase was credited.`,
      '',
      `Bundle: ${input.bundleName}`,
      `Branch: ${input.branchName}`,
      `Amount: ${amountLabel}`,
      `SMS units: ${unitsLabel}`,
      `New balance: ${balanceLabel} SMS`,
      `Reference: #${ref}`,
      '',
      '— REMBEH by Antikra',
    ].join('\n');

    const html = [
      '<div style="font-family:Arial,Helvetica,sans-serif;color:#14213d;line-height:1.5;max-width:520px">',
      this.brandHeaderHtml(),
      '<h1 style="font-size:20px;margin:0 0 12px">SMS credits receipt</h1>',
      `<p style="margin:0 0 12px">Hello ${input.payerName}, your SMS purchase was credited.</p>`,
      '<ul style="margin:0 0 16px;padding-left:18px;font-size:14px">',
      `<li><strong>Bundle:</strong> ${input.bundleName}</li>`,
      `<li><strong>Branch:</strong> ${input.branchName}</li>`,
      `<li><strong>Amount:</strong> ${amountLabel}</li>`,
      `<li><strong>SMS units:</strong> ${unitsLabel}</li>`,
      `<li><strong>New balance:</strong> ${balanceLabel} SMS</li>`,
      `<li><strong>Reference:</strong> #${ref}</li>`,
      '</ul>',
      '<p style="margin:0;color:#52606d;font-size:12px">— REMBEH by Antikra</p>',
      '</div>',
    ].join('');

    const response = await this.sendResendEmail({
      apiKey,
      from,
      to: input.destination,
      subject: `REMBEH SMS receipt — ${input.bundleName}`,
      text,
      html,
    });
    if (!response.ok) {
      const detail = await this.readResendError(response);
      this.logger.warn(`SMS receipt email failed: ${detail}`);
      return { delivered: false };
    }
    return { delivered: true };
  }

  /** Ops / owner alert when SMS credits are successfully credited. */
  async sendSmsPurchaseAdminAlertEmail(input: {
    destination: string;
    branchName: string;
    bundleName: string;
    amountUgx: number;
    smsUnits: number;
    reference: string;
    tenantId: string;
  }): Promise<{ delivered: boolean }> {
    const from = this.getEmailFromHeader('operations');
    const apiKey = this.getResendApiKey();
    if (!apiKey) {
      return { delivered: false };
    }

    const amountLabel = `UGX ${input.amountUgx.toLocaleString('en-UG')}`;
    const unitsLabel = input.smsUnits.toLocaleString('en-UG');
    const text = [
      'SMS wallet credit confirmed',
      '',
      `Branch: ${input.branchName}`,
      `Bundle: ${input.bundleName}`,
      `Amount: ${amountLabel}`,
      `Units: ${unitsLabel}`,
      `Reference: ${input.reference}`,
      `Tenant: ${input.tenantId}`,
      '',
      '— REMBEH ops',
    ].join('\n');
    const htmlInput = {
      branchName: this.escapeHtml(input.branchName),
      bundleName: this.escapeHtml(input.bundleName),
      amountLabel: this.escapeHtml(amountLabel),
      unitsLabel: this.escapeHtml(unitsLabel),
      reference: this.escapeHtml(input.reference),
      tenantId: this.escapeHtml(input.tenantId),
    };
    const html = [
      '<div style="font-family:Arial,Helvetica,sans-serif;color:#14213d;line-height:1.5;max-width:620px">',
      this.brandHeaderHtml(),
      '<h1 style="font-size:22px;margin:0 0 12px">SMS wallet credit confirmed</h1>',
      '<div style="border:1px solid #dfe7ef;border-radius:12px;padding:14px;background:#f8fbfa;margin:0 0 14px">',
      `<p style="margin:0 0 8px"><strong>Branch:</strong> ${htmlInput.branchName}</p>`,
      `<p style="margin:0 0 8px"><strong>Bundle:</strong> ${htmlInput.bundleName}</p>`,
      `<p style="margin:0 0 8px"><strong>Amount:</strong> ${htmlInput.amountLabel}</p>`,
      `<p style="margin:0 0 8px"><strong>Units:</strong> ${htmlInput.unitsLabel}</p>`,
      `<p style="margin:0 0 8px"><strong>Reference:</strong> ${htmlInput.reference}</p>`,
      `<p style="margin:0"><strong>Tenant:</strong> ${htmlInput.tenantId}</p>`,
      '</div>',
      '<p style="margin:0;color:#52606d;font-size:12px">— REMBEH ops</p>',
      '</div>',
    ].join('');

    const response = await this.sendResendEmail({
      apiKey,
      from,
      to: input.destination,
      subject: `[REMBEH] SMS credited — ${input.branchName}`,
      text,
      html,
    });
    if (!response.ok) {
      const detail = await this.readResendError(response);
      this.logger.warn(`SMS admin alert email failed: ${detail}`);
      return { delivered: false };
    }
    return { delivered: true };
  }

  async sendSubscriptionPaymentVerificationAlertEmail(input: {
    recipients: string[];
    replyTo?: string | null;
    paymentId: string;
    organizationName: string;
    branchName: string;
    planLabel: string;
    amountLabel: string;
    paymentMethod: string;
    merchantCode: string;
    transactionId: string;
    submittedByName: string;
    submittedByEmail: string | null;
    submittedAt: string;
    teamReminder?: string | null;
  }): Promise<{ delivered: boolean; error?: string }> {
    const from = this.getEmailFromHeader('billing');
    const apiKey = this.getResendApiKey();
    if (!apiKey) {
      const message =
        'Payment verification email skipped — Resend not configured.';
      this.logger.warn(message);
      if (this.isProduction()) {
        throw new ServiceUnavailableException(
          'Payment alert email could not be sent. Check RESEND_API_KEY and EMAIL_FROM.',
        );
      }
      return { delivered: false, error: message };
    }

    const recipients = input.recipients.filter(Boolean);
    if (recipients.length === 0) {
      return { delivered: false, error: 'No payment verification recipients.' };
    }

    const replyLine = input.replyTo
      ? `Reply to this email. Replies go to ${input.replyTo}.`
      : 'Reply to this email after checking the merchant transaction.';
    const htmlInput = {
      paymentId: this.escapeHtml(input.paymentId),
      organizationName: this.escapeHtml(input.organizationName),
      branchName: this.escapeHtml(input.branchName),
      planLabel: this.escapeHtml(input.planLabel),
      amountLabel: this.escapeHtml(input.amountLabel),
      paymentMethod: this.escapeHtml(input.paymentMethod),
      merchantCode: this.escapeHtml(input.merchantCode),
      transactionId: this.escapeHtml(input.transactionId),
      submittedByName: this.escapeHtml(input.submittedByName),
      submittedByEmail: input.submittedByEmail
        ? this.escapeHtml(input.submittedByEmail)
        : null,
      submittedAt: this.escapeHtml(input.submittedAt),
      replyLine: this.escapeHtml(replyLine),
      teamReminder: input.teamReminder
        ? this.escapeHtml(input.teamReminder)
        : null,
    };
    const text = [
      'A new payment has been submitted for verification in Rembeh.',
      '',
      `Organization: ${input.organizationName}`,
      `Branch: ${input.branchName}`,
      `Manager: ${input.submittedByName}`,
      `Manager email: ${input.submittedByEmail ?? '-'}`,
      '',
      `Purchase: ${input.planLabel}`,
      `Amount: ${input.amountLabel}`,
      `Payment method: ${input.paymentMethod}`,
      `Merchant code: ${input.merchantCode}`,
      `Transaction ID: ${input.transactionId}`,
      '',
      `Submitted: ${input.submittedAt}`,
      ...(input.teamReminder
        ? ['', `Team reminder: ${input.teamReminder}`]
        : []),
      '',
      `Payment request: REMBEH-PAY:${input.paymentId}`,
      replyLine,
      '',
      'To verify one or many payments, reply with the merchant transaction IDs separated by commas.',
      `This submitted ID: ${input.transactionId}`,
      '',
      'If this payment could not be verified, reply:',
      'FAIL Transaction could not be found.',
      '',
      'Only replies from allowed Antikra team emails are accepted by the server.',
      '',
      '— REMBEH payment verification',
    ].join('\n');

    const html = [
      '<div style="font-family:Arial,Helvetica,sans-serif;color:#14213d;line-height:1.5;max-width:680px">',
      this.brandHeaderHtml(),
      '<h1 style="font-size:22px;margin:0 0 6px">Payment submitted for verification</h1>',
      '<p style="margin:0 0 14px;color:#52606d">Check the merchant transaction, then reply to this email with the confirmed transaction ID or IDs.</p>',
      '<h2 style="font-size:16px;margin:0 0 8px">Payment details</h2>',
      '<div style="border:1px solid #dfe7ef;border-radius:12px;padding:16px;background:#f8fbfa">',
      `<p style="margin:0 0 8px"><strong>Organization:</strong> ${htmlInput.organizationName}</p>`,
      `<p style="margin:0 0 8px"><strong>Branch:</strong> ${htmlInput.branchName}</p>`,
      `<p style="margin:0 0 8px"><strong>Manager:</strong> ${htmlInput.submittedByName}</p>`,
      `<p style="margin:0 0 8px"><strong>Manager email:</strong> ${htmlInput.submittedByEmail ?? '-'}</p>`,
      `<p style="margin:0 0 8px"><strong>Purchase:</strong> ${htmlInput.planLabel}</p>`,
      `<p style="margin:0 0 8px"><strong>Amount:</strong> ${htmlInput.amountLabel}</p>`,
      `<p style="margin:0 0 8px"><strong>Payment method:</strong> ${htmlInput.paymentMethod}</p>`,
      `<p style="margin:0 0 8px"><strong>Merchant code:</strong> ${htmlInput.merchantCode}</p>`,
      `<p style="margin:0 0 8px"><strong>Transaction ID:</strong> <span style="font-family:monospace;font-weight:700">${htmlInput.transactionId}</span></p>`,
      `<p style="margin:0"><strong>Submitted:</strong> ${htmlInput.submittedAt}</p>`,
      htmlInput.teamReminder
        ? `<p style="margin:12px 0 0;padding:10px;border-radius:8px;background:#fff8e1"><strong>Team reminder:</strong> ${htmlInput.teamReminder}</p>`
        : '',
      '</div>',
      `<p style="margin:14px 0 0;color:#52606d;font-size:12px">Payment request: REMBEH-PAY:${htmlInput.paymentId}</p>`,
      '<h2 style="font-size:16px;margin:18px 0 8px">Reply instructions</h2>',
      `<p style="margin:0 0 10px">${htmlInput.replyLine}</p>`,
      '<p style="margin:0 0 6px">To verify one or many payments, reply with the merchant transaction IDs separated by commas.</p>',
      `<pre style="background:#eef8f2;border-radius:8px;padding:10px;font-family:monospace">This submitted ID: ${htmlInput.transactionId}</pre>`,
      '<p style="margin:12px 0 6px">If this payment could not be verified, reply:</p>',
      '<pre style="background:#fff1f2;border-radius:8px;padding:10px;font-family:monospace">FAIL Transaction could not be found.</pre>',
      '<p style="margin:12px 0 0;color:#52606d;font-size:12px">Only replies from allowed Antikra team emails are accepted by the server.</p>',
      '</div>',
    ].join('');

    const response = await this.sendResendEmail({
      apiKey,
      from,
      to: recipients,
      replyTo: input.replyTo ?? undefined,
      subject: `[REMBEH-PAY:${input.paymentId}] Payment verification — ${input.branchName}`,
      text,
      html,
      headers: {
        'X-Rembeh-Payment-Id': input.paymentId,
      },
    });

    if (!response.ok) {
      const detail = await this.readResendError(response);
      this.logger.warn(`Payment verification alert email failed: ${detail}`);
      return { delivered: false, error: detail };
    }
    return { delivered: true };
  }

  async sendSubscriptionPaymentVerificationSummaryEmail(input: {
    recipients: string[];
    replyTo?: string | null;
    confirmed: Array<{
      organizationName: string;
      branchName: string;
      planLabel: string;
      amountLabel: string;
      paymentMethod: string;
      merchantCode: string;
      transactionId: string;
    }>;
    remaining: Array<{
      organizationName: string;
      branchName: string;
      planLabel: string;
      amountLabel: string;
      paymentMethod: string;
      merchantCode: string;
      transactionId: string;
    }>;
    unmatchedIds: string[];
    ambiguousIds: string[];
    replyFromEmail: string;
  }): Promise<{ delivered: boolean; error?: string }> {
    const from = this.getEmailFromHeader('billing');
    const apiKey = this.getResendApiKey();
    if (!apiKey) {
      const message =
        'Payment verification summary email skipped — Resend not configured.';
      this.logger.warn(message);
      return { delivered: false, error: message };
    }

    const recipients = input.recipients.filter(Boolean);
    if (recipients.length === 0) {
      return { delivered: false, error: 'No payment verification recipients.' };
    }

    const lineFor = (item: (typeof input.confirmed)[number]) =>
      `${item.transactionId} — ${item.organizationName}, ${item.branchName}, ${item.planLabel}, ${item.amountLabel}, ${item.paymentMethod}, merchant ${item.merchantCode}`;
    const confirmedLines = input.confirmed.map(lineFor);
    const remainingLines = input.remaining.map(lineFor);
    const repliedCount =
      input.confirmed.length +
      input.unmatchedIds.length +
      input.ambiguousIds.length;
    const text = [
      'Rembeh payment verification summary',
      '',
      `Reply processed from: ${input.replyFromEmail}`,
      `IDs received in reply: ${repliedCount}`,
      `Confirmed IDs: ${input.confirmed.length}`,
      `Still pending: ${input.remaining.length}`,
      '',
      'Confirmed:',
      ...(confirmedLines.length > 0 ? confirmedLines : ['None']),
      '',
      'Still pending:',
      ...(remainingLines.length > 0 ? remainingLines : ['None']),
      '',
      ...(input.unmatchedIds.length > 0
        ? ['Unmatched IDs from reply:', input.unmatchedIds.join(', '), '']
        : []),
      ...(input.ambiguousIds.length > 0
        ? [
            'Ambiguous IDs from reply:',
            input.ambiguousIds.join(', '),
            'These were left pending because more than one pending payment has the same transaction ID.',
            '',
          ]
        : []),
      input.remaining.length > 0
        ? 'Reply with the remaining merchant transaction IDs separated by commas when they are found.'
        : 'All pending manual merchant payments have been handled.',
      '',
      '— REMBEH payment verification',
    ].join('\n');

    const htmlList = (items: string[]) =>
      items.length > 0
        ? `<ul>${items.map((item) => `<li>${this.escapeHtml(item)}</li>`).join('')}</ul>`
        : '<p>None</p>';
    const html = [
      '<div style="font-family:Arial,Helvetica,sans-serif;color:#14213d;line-height:1.5;max-width:720px">',
      this.brandHeaderHtml(),
      '<h1 style="font-size:22px;margin:0 0 14px">Payment verification summary</h1>',
      `<p><strong>Reply processed from:</strong> ${this.escapeHtml(input.replyFromEmail)}</p>`,
      `<p><strong>IDs received in reply:</strong> ${repliedCount}<br><strong>Confirmed IDs:</strong> ${input.confirmed.length}<br><strong>Still pending:</strong> ${input.remaining.length}</p>`,
      '<h2 style="font-size:16px;margin:18px 0 8px">Confirmed</h2>',
      htmlList(confirmedLines),
      '<h2 style="font-size:16px;margin:18px 0 8px">Still pending</h2>',
      htmlList(remainingLines),
      input.unmatchedIds.length > 0
        ? `<h2 style="font-size:16px;margin:18px 0 8px">Unmatched IDs</h2><p>${this.escapeHtml(input.unmatchedIds.join(', '))}</p>`
        : '',
      input.ambiguousIds.length > 0
        ? `<h2 style="font-size:16px;margin:18px 0 8px">Ambiguous IDs</h2><p>${this.escapeHtml(input.ambiguousIds.join(', '))}</p><p>These were left pending because more than one pending payment has the same transaction ID.</p>`
        : '',
      `<p style="margin:18px 0 0;padding:12px;border-radius:10px;background:#f8fbfa">${this.escapeHtml(
        input.remaining.length > 0
          ? 'Reply with the remaining merchant transaction IDs separated by commas when they are found.'
          : 'All pending manual merchant payments have been handled.',
      )}</p>`,
      '</div>',
    ].join('');

    const response = await this.sendResendEmail({
      apiKey,
      from,
      to: recipients,
      replyTo: input.replyTo ?? undefined,
      subject: `[REMBEH] Payment verification summary — ${input.confirmed.length} confirmed, ${input.remaining.length} pending`,
      text,
      html,
    });

    if (!response.ok) {
      const detail = await this.readResendError(response);
      this.logger.warn(`Payment verification summary email failed: ${detail}`);
      return { delivered: false, error: detail };
    }
    return { delivered: true };
  }

  async sendSubscriptionReminderEmail(input: {
    destination: string;
    recipientName: string;
    organizationName: string;
    branchName: string;
    kind: 'trial_ending' | 'expires_soon' | 'grace' | 'locked';
    daysRemaining: number;
    periodEnd?: Date | null;
    graceEndsAt?: Date | null;
  }): Promise<{ delivered: boolean; error?: string }> {
    const from = this.getEmailFromHeader('billing');
    const apiKey = this.getResendApiKey();
    if (!apiKey) {
      const message =
        'Subscription reminder email skipped — Resend not configured.';
      this.logger.warn(message);
      return { delivered: false, error: message };
    }

    const actionUrl = buildWebAppUrl(this.configService, '/owner/subscription');
    const days = Math.max(0, input.daysRemaining);
    const dayLabel =
      days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'}`;
    const graceWindowLabel = days === 0 ? 'today' : `${dayLabel} left`;
    const periodEndLabel = input.periodEnd
      ? this.formatEmailDate(input.periodEnd)
      : null;
    const graceEndLabel = input.graceEndsAt
      ? this.formatEmailDate(input.graceEndsAt)
      : null;

    const title =
      input.kind === 'locked'
        ? `${input.branchName} is paused`
        : input.kind === 'grace'
          ? `${input.branchName} needs renewal`
          : input.kind === 'trial_ending'
            ? days === 0
              ? `${input.branchName} trial ends today`
              : `${input.branchName} trial ends in ${dayLabel}`
            : days === 0
              ? `${input.branchName} subscription expires today`
              : `${input.branchName} subscription expires in ${dayLabel}`;
    const body =
      input.kind === 'locked'
        ? `The subscription for ${input.branchName} was not renewed in time, so branch access is now paused. Renew the subscription to restore access.`
        : input.kind === 'grace'
          ? `The subscription for ${input.branchName} has expired. You have ${graceWindowLabel} to renew${
              graceEndLabel ? ` by ${graceEndLabel}` : ''
            } before branch access is paused.`
          : input.kind === 'trial_ending'
            ? `The trial for ${input.branchName} ends ${
                days === 0 ? 'today' : `in ${dayLabel}`
              }${
                periodEndLabel ? ` on ${periodEndLabel}` : ''
              }. Subscribe now so the branch continues smoothly after the trial.`
            : `The subscription for ${input.branchName} expires ${
                days === 0 ? 'today' : `in ${dayLabel}`
              }${
                periodEndLabel ? ` on ${periodEndLabel}` : ''
              }. Renew now to keep access uninterrupted.`;
    const subject =
      input.kind === 'locked'
        ? `[REMBEH] ${input.branchName} is paused`
        : input.kind === 'grace'
          ? days === 0
            ? `[REMBEH] ${input.branchName} must renew today`
            : `[REMBEH] ${input.branchName} has ${dayLabel} left to renew`
          : `[REMBEH] ${title}`;

    const text = [
      `Hello ${input.recipientName},`,
      '',
      title,
      '',
      body,
      '',
      `Organization: ${input.organizationName}`,
      `Branch: ${input.branchName}`,
      ...(periodEndLabel ? [`Period ends: ${periodEndLabel}`] : []),
      ...(graceEndLabel ? [`Grace ends: ${graceEndLabel}`] : []),
      '',
      `Open Subscription: ${actionUrl}`,
      '',
      '— REMBEH by Antikra',
    ].join('\n');

    const htmlInput = {
      recipientName: this.escapeHtml(input.recipientName),
      organizationName: this.escapeHtml(input.organizationName),
      branchName: this.escapeHtml(input.branchName),
      title: this.escapeHtml(title),
      body: this.escapeHtml(body),
      periodEndLabel: periodEndLabel ? this.escapeHtml(periodEndLabel) : null,
      graceEndLabel: graceEndLabel ? this.escapeHtml(graceEndLabel) : null,
      actionUrl: this.escapeHtml(actionUrl),
    };

    const html = [
      '<div style="font-family:Arial,Helvetica,sans-serif;color:#14213d;line-height:1.5;max-width:620px">',
      this.brandHeaderHtml(),
      `<h1 style="font-size:22px;margin:0 0 12px">${htmlInput.title}</h1>`,
      `<p style="margin:0 0 16px">Hello ${htmlInput.recipientName}, ${htmlInput.body}</p>`,
      '<div style="border:1px solid #dfe7ef;border-radius:12px;padding:14px;background:#f8fbfa;margin:0 0 16px">',
      `<p style="margin:0 0 8px"><strong>Organization:</strong> ${htmlInput.organizationName}</p>`,
      `<p style="margin:0 0 8px"><strong>Branch:</strong> ${htmlInput.branchName}</p>`,
      htmlInput.periodEndLabel
        ? `<p style="margin:0 0 8px"><strong>Period ends:</strong> ${htmlInput.periodEndLabel}</p>`
        : '',
      htmlInput.graceEndLabel
        ? `<p style="margin:0"><strong>Grace ends:</strong> ${htmlInput.graceEndLabel}</p>`
        : '',
      '</div>',
      `<p style="margin:0 0 16px"><a href="${htmlInput.actionUrl}" style="display:inline-block;background:#0f8a6c;color:#ffffff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">Open Subscription</a></p>`,
      '<p style="margin:0;color:#52606d;font-size:12px">— REMBEH by Antikra</p>',
      '</div>',
    ].join('');

    const response = await this.sendResendEmail({
      apiKey,
      from,
      to: input.destination,
      subject,
      text,
      html,
    });

    if (!response.ok) {
      const detail = await this.readResendError(response);
      this.logger.warn(`Subscription reminder email failed: ${detail}`);
      return { delivered: false, error: detail };
    }
    return { delivered: true };
  }

  async sendSubscriptionPricingChangedEmail(input: {
    recipients: string[];
    organizationName: string;
    branchName: string | null;
    scope: 'ORGANIZATION' | 'BRANCH';
    affectedBranches: number;
    effectiveFrom: Date;
    effectiveUntil: Date | null;
    reason: string;
    changedBy: string;
    prices: Array<{
      planName: string;
      planCode: string;
      oldAmount: number;
      newAmount: number;
      currency: string;
    }>;
  }): Promise<{ delivered: boolean; error?: string }> {
    const from = this.getEmailFromHeader('billing');
    const apiKey = this.getResendApiKey();
    if (!apiKey) {
      const message = 'Pricing update email skipped — Resend not configured.';
      this.logger.warn(message);
      return { delivered: false, error: message };
    }

    const recipients = [...new Set(input.recipients.filter(Boolean))];
    if (recipients.length === 0) {
      return { delivered: false, error: 'No pricing update recipients.' };
    }

    const effectiveFromLabel = this.formatEmailDate(input.effectiveFrom);
    const effectiveUntilLabel = input.effectiveUntil
      ? this.formatEmailDate(input.effectiveUntil)
      : 'No end date';
    const scopeLabel =
      input.scope === 'BRANCH' && input.branchName
        ? `${input.branchName} branch`
        : `${input.organizationName} organization`;
    const actionUrl = buildWebAppUrl(this.configService, '/subscription');
    const priceLines = input.prices.map(
      (price) =>
        `${price.planName}: ${this.formatEmailMoney(
          price.oldAmount,
          price.currency,
        )} → ${this.formatEmailMoney(price.newAmount, price.currency)}`,
    );

    const text = [
      'REMBEH subscription pricing has been updated.',
      '',
      `Organization: ${input.organizationName}`,
      `Scope: ${scopeLabel}`,
      `Affected branches: ${input.affectedBranches}`,
      `Effective from: ${effectiveFromLabel}`,
      `Effective until: ${effectiveUntilLabel}`,
      `Changed by: ${input.changedBy}`,
      '',
      'Updated prices:',
      ...priceLines,
      '',
      `Reason: ${input.reason}`,
      '',
      `View subscription pricing: ${actionUrl}`,
      '',
      'Current active subscription periods are not changed mid-cycle. The updated amount is used for the next applicable checkout or renewal.',
      '',
      '— REMBEH Billing',
    ].join('\n');

    const htmlInput = {
      organizationName: this.escapeHtml(input.organizationName),
      scopeLabel: this.escapeHtml(scopeLabel),
      effectiveFromLabel: this.escapeHtml(effectiveFromLabel),
      effectiveUntilLabel: this.escapeHtml(effectiveUntilLabel),
      changedBy: this.escapeHtml(input.changedBy),
      reason: this.escapeHtml(input.reason),
      actionUrl: this.escapeHtml(actionUrl),
    };
    const rows = input.prices
      .map(
        (price) => `
          <tr>
            <td style="padding:10px;border-bottom:1px solid #e6edf3"><strong>${this.escapeHtml(price.planName)}</strong><br><span style="color:#64748b;font-size:12px">${this.escapeHtml(price.planCode)}</span></td>
            <td style="padding:10px;border-bottom:1px solid #e6edf3;text-align:right">${this.escapeHtml(this.formatEmailMoney(price.oldAmount, price.currency))}</td>
            <td style="padding:10px;border-bottom:1px solid #e6edf3;text-align:right;color:#0f8a6c;font-weight:700">${this.escapeHtml(this.formatEmailMoney(price.newAmount, price.currency))}</td>
          </tr>`,
      )
      .join('');
    const html = [
      '<div style="font-family:Arial,Helvetica,sans-serif;color:#14213d;line-height:1.5;max-width:680px">',
      this.brandHeaderHtml(),
      '<h1 style="font-size:22px;margin:0 0 10px">Subscription pricing updated</h1>',
      `<p style="margin:0 0 16px">The REMBEH subscription pricing for <strong>${htmlInput.scopeLabel}</strong> has been updated.</p>`,
      '<div style="border:1px solid #dfe7ef;border-radius:12px;padding:14px;background:#f8fbfa;margin:0 0 16px">',
      `<p style="margin:0 0 8px"><strong>Organization:</strong> ${htmlInput.organizationName}</p>`,
      `<p style="margin:0 0 8px"><strong>Scope:</strong> ${htmlInput.scopeLabel}</p>`,
      `<p style="margin:0 0 8px"><strong>Affected branches:</strong> ${input.affectedBranches}</p>`,
      `<p style="margin:0 0 8px"><strong>Effective from:</strong> ${htmlInput.effectiveFromLabel}</p>`,
      `<p style="margin:0 0 8px"><strong>Effective until:</strong> ${htmlInput.effectiveUntilLabel}</p>`,
      `<p style="margin:0"><strong>Changed by:</strong> ${htmlInput.changedBy}</p>`,
      '</div>',
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e6edf3;border-radius:12px;border-collapse:separate;border-spacing:0;overflow:hidden;margin:0 0 16px">',
      '<thead><tr><th align="left" style="padding:10px;background:#f2f6f8;font-size:12px">Plan</th><th align="right" style="padding:10px;background:#f2f6f8;font-size:12px">Previous</th><th align="right" style="padding:10px;background:#f2f6f8;font-size:12px">Updated</th></tr></thead>',
      `<tbody>${rows}</tbody>`,
      '</table>',
      `<p style="margin:0 0 14px"><strong>Reason:</strong> ${htmlInput.reason}</p>`,
      '<p style="margin:0 0 16px;color:#52606d;font-size:13px">Current active subscription periods are not changed mid-cycle. The updated amount is used for the next applicable checkout or renewal.</p>',
      `<p style="margin:0 0 16px"><a href="${htmlInput.actionUrl}" style="display:inline-block;background:#0f8a6c;color:#ffffff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">Open Subscription</a></p>`,
      '<p style="margin:0;color:#52606d;font-size:12px">— REMBEH Billing</p>',
      '</div>',
    ].join('');

    const subject =
      input.scope === 'BRANCH' && input.branchName
        ? `[REMBEH Billing] Pricing updated — ${input.branchName}`
        : `[REMBEH Billing] Pricing updated — ${input.organizationName}`;
    const response = await this.sendResendEmail({
      apiKey,
      from,
      to: recipients,
      subject,
      text,
      html,
    });

    if (!response.ok) {
      const detail = await this.readResendError(response);
      this.logger.warn(`Pricing update email failed: ${detail}`);
      return { delivered: false, error: detail };
    }
    return { delivered: true };
  }

  async retrieveReceivedEmail(emailId: string): Promise<{
    id: string;
    from: string;
    to: string[];
    received_for?: string[];
    subject: string | null;
    text: string | null;
    html: string | null;
    message_id?: string | null;
  } | null> {
    const apiKey = this.getResendApiKey();
    if (!apiKey) {
      this.logger.warn('Received email fetch skipped — Resend not configured.');
      return null;
    }

    const response = await fetch(
      `${RESEND_RECEIVED_EMAIL_ENDPOINT}/${encodeURIComponent(emailId)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
    );
    if (!response.ok) {
      const detail = await this.readResendError(response);
      this.logger.warn(`Received email fetch failed: ${detail}`);
      return null;
    }
    return (await response.json()) as {
      id: string;
      from: string;
      to: string[];
      received_for?: string[];
      subject: string | null;
      text: string | null;
      html: string | null;
      message_id?: string | null;
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
    to: string | string[];
    replyTo?: string;
    subject: string;
    text: string;
    html: string;
    headers?: Record<string, string>;
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
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
        subject: input.subject,
        text: input.text,
        html: input.html,
        ...(input.headers ? { headers: input.headers } : {}),
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

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private plainTextHtml(value: string) {
    return [
      '<div style="font-family:Arial,Helvetica,sans-serif;color:#14213d;line-height:1.5;max-width:620px">',
      this.brandHeaderHtml(),
      `<p style="white-space:pre-wrap;margin:0">${this.escapeHtml(value)}</p>`,
      '</div>',
    ].join('');
  }

  private brandHeaderHtml() {
    const iconUrl = this.emailAssetUrl('/rembeh-icon.png');
    const antikraUrl = this.emailAssetUrl('/assets/brand/antikra.png');
    return [
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border-collapse:collapse">',
      '<tr>',
      '<td style="vertical-align:middle">',
      '<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse">',
      '<tr>',
      `<td style="vertical-align:middle;padding:0 10px 0 0"><img src="${iconUrl}" width="38" height="38" alt="REMBEH" style="display:block;border-radius:10px" /></td>`,
      '<td style="vertical-align:middle">',
      '<p style="margin:0 0 2px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#0f8a6c">REMBEH</p>',
      '<p style="margin:0;color:#52606d;font-size:12px">Loan Management System</p>',
      '</td>',
      '</tr>',
      '</table>',
      '</td>',
      `<td align="right" style="vertical-align:middle"><img src="${antikraUrl}" width="92" alt="ANTIKRA" style="display:block;max-width:92px;height:auto;border-radius:8px" /></td>`,
      '</tr>',
      '</table>',
    ].join('');
  }

  private emailAssetUrl(pathname: string) {
    const baseUrl = resolveWebAppBaseUrl(this.configService);
    const url = new URL(
      pathname.startsWith('/') ? pathname : `/${pathname}`,
      `${baseUrl}/`,
    );
    return this.escapeHtml(url.toString());
  }

  private formatEmailDate(value: Date) {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(value);
  }

  private formatEmailMoney(amount: number, currency: string) {
    return `${currency} ${amount.toLocaleString('en-UG')}`;
  }

  /** Resend-style "Name <email@domain>" with category-specific fallbacks. */
  private getEmailFromHeader(category: RembehEmailCategory = 'auth'): string {
    const configByCategory: Record<
      RembehEmailCategory,
      {
        emailKeys: string[];
        nameKeys: string[];
        fallbackEmail: string;
        fallbackName: string;
      }
    > = {
      auth: {
        emailKeys: ['AUTH_EMAIL_FROM', 'OTP_EMAIL_FROM'],
        nameKeys: ['AUTH_EMAIL_FROM_NAME', 'OTP_EMAIL_FROM_NAME'],
        fallbackEmail: 'auth@antikra.com',
        fallbackName: 'REMBEH Security',
      },
      billing: {
        emailKeys: ['BILLING_EMAIL_FROM', 'SUBSCRIPTION_EMAIL_FROM'],
        nameKeys: ['BILLING_EMAIL_FROM_NAME', 'SUBSCRIPTION_EMAIL_FROM_NAME'],
        fallbackEmail: 'billing@antikra.com',
        fallbackName: 'REMBEH Billing',
      },
      marketing: {
        emailKeys: ['MARKETING_EMAIL_FROM'],
        nameKeys: ['MARKETING_EMAIL_FROM_NAME'],
        fallbackEmail: 'marketing@antikra.com',
        fallbackName: 'REMBEH Growth',
      },
      operations: {
        emailKeys: ['OPERATIONS_EMAIL_FROM'],
        nameKeys: ['OPERATIONS_EMAIL_FROM_NAME'],
        fallbackEmail: 'operations@antikra.com',
        fallbackName: 'REMBEH Operations',
      },
      support: {
        emailKeys: ['SUPPORT_EMAIL_FROM'],
        nameKeys: ['SUPPORT_EMAIL_FROM_NAME'],
        fallbackEmail: 'support@antikra.com',
        fallbackName: 'REMBEH Support',
      },
    };
    const config = configByCategory[category];
    const email =
      this.firstConfiguredValue(config.emailKeys) ||
      this.configService.get<string>('EMAIL_FROM')?.trim() ||
      config.fallbackEmail;
    const name =
      this.firstConfiguredValue(config.nameKeys) ||
      this.configService.get<string>('EMAIL_FROM_NAME')?.trim() ||
      config.fallbackName;

    if (email.includes('<')) {
      return email;
    }
    return `${name} <${email}>`;
  }

  private firstConfiguredValue(keys: string[]) {
    for (const key of keys) {
      const value = this.configService.get<string>(key)?.trim();
      if (value) return value;
    }
    return undefined;
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
      this.brandHeaderHtml(),
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
      this.brandHeaderHtml(),
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
