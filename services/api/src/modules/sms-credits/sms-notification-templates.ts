export type SmsNotificationKind =
  | 'loan_recorded'
  | 'payment_confirmation'
  | 'payment_reminder'
  | 'overdue_notice';

export type SmsNotificationSettingsContract = {
  enabled: boolean;
  loanRecordedEnabled: boolean;
  paymentConfirmationEnabled: boolean;
  paymentReminderEnabled: boolean;
  overdueNoticeEnabled: boolean;
  templates: {
    loanRecorded: string;
    paymentConfirmation: string;
    paymentReminder: string;
    overdueNotice: string;
  };
  updatedAt: string | null;
};

export const SMS_NOTIFICATION_TEMPLATES = {
  loanRecorded:
    '[Surname], your loan of [Principal] has been recorded. Call [Branch] at [Manager Tel] within 24 hours to verify your contact info.',
  paymentConfirmation:
    '[Surname], your payment of UGX [Amount] has been received. Your loan balance is UGX [Balance]. Thank you. Call [phone] for support.',
  paymentReminder:
    'Dear [Surname], your loan payment of UGX [Balance] is due for [Days] day(s). Please pay on time. Call [phone] for support.',
  overdueNotice:
    'Dear [Surname], your loan payment of UGX [Amount] is overdue by [Days] days. Pay immediately to avoid extra charges. Call [phone] for support.',
} as const;

export const DEFAULT_SMS_NOTIFICATION_SETTINGS: Omit<
  SmsNotificationSettingsContract,
  'updatedAt'
> = {
  enabled: true,
  loanRecordedEnabled: true,
  paymentConfirmationEnabled: true,
  paymentReminderEnabled: true,
  overdueNoticeEnabled: true,
  templates: { ...SMS_NOTIFICATION_TEMPLATES },
};

/** First token — common local order is Surname + given names. */
export function smsSurname(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts[0] || 'Customer';
}

export function formatSmsMoney(amount: number): string {
  return Math.round(amount).toLocaleString('en-UG');
}

export function buildLoanRecordedSms(input: {
  fullName: string;
  principal: number;
  branchName: string;
  supportPhone: string;
}): string {
  return SMS_NOTIFICATION_TEMPLATES.loanRecorded
    .replace('[Surname]', smsSurname(input.fullName))
    .replace('[Principal]', `UGX ${formatSmsMoney(input.principal)}`)
    .replace('[Branch]', input.branchName || 'the branch')
    .replace('[Manager Tel]', input.supportPhone || 'the branch');
}

export function buildPaymentConfirmationSms(input: {
  fullName: string;
  amount: number;
  balance: number;
  supportPhone: string;
}): string {
  return SMS_NOTIFICATION_TEMPLATES.paymentConfirmation
    .replace('[Surname]', smsSurname(input.fullName))
    .replace('[Amount]', formatSmsMoney(input.amount))
    .replace('[Balance]', formatSmsMoney(input.balance))
    .replace('[phone]', input.supportPhone || 'the branch');
}

export function buildPaymentReminderSms(input: {
  fullName: string;
  balance: number;
  days: number;
  supportPhone: string;
}): string {
  return SMS_NOTIFICATION_TEMPLATES.paymentReminder
    .replace('[Surname]', smsSurname(input.fullName))
    .replace('[Balance]', formatSmsMoney(input.balance))
    .replace('[Days]', String(Math.max(0, Math.round(input.days))))
    .replace('[phone]', input.supportPhone || 'the branch');
}

export function buildOverdueNoticeSms(input: {
  fullName: string;
  amount: number;
  days: number;
  supportPhone: string;
}): string {
  return SMS_NOTIFICATION_TEMPLATES.overdueNotice
    .replace('[Surname]', smsSurname(input.fullName))
    .replace('[Amount]', formatSmsMoney(input.amount))
    .replace('[Days]', String(Math.max(0, Math.round(input.days))))
    .replace('[phone]', input.supportPhone || 'the branch');
}
