export type EmailOtpPurpose = 'WORKSPACE_REGISTRATION' | 'EMPLOYEE_INVITATION';

export type EmailOtpDeliveryInput = {
  tenantId: string;
  userId?: string | null;
  destination: string;
  code: string;
  purpose: EmailOtpPurpose;
  expiresAt: Date;
};

export type EmailOtpDeliveryResult = {
  channel: 'EMAIL';
  provider: 'resend' | 'development';
  delivered: boolean;
  from: string;
  destination: string;
  message: string;
};

export type PhoneOtpDeliveryInput = {
  tenantId: string;
  userId?: string | null;
  destination: string;
  code: string;
  purpose: EmailOtpPurpose;
  expiresAt: Date;
};

export type PhoneOtpDeliveryResult = {
  channel: 'PHONE';
  provider: 'development';
  delivered: boolean;
  destination: string;
  devCode?: string;
  message: string;
};

export type StaffInvitationEmailInput = {
  tenantId: string;
  userId: string;
  destination: string;
  invitedByName: string;
  workspaceName: string;
  branchName: string;
  roleName: string;
  token: string;
  expiresAt: Date;
};

export type StaffInvitationEmailResult = EmailOtpDeliveryResult;

export type PublicOtpDelivery = {
  channel: 'EMAIL' | 'PHONE';
  provider:
    EmailOtpDeliveryResult['provider'] | PhoneOtpDeliveryResult['provider'];
  delivered: boolean;
  destination: string;
  message: string;
};

export function toPublicOtpDelivery(
  delivery: EmailOtpDeliveryResult | PhoneOtpDeliveryResult,
): PublicOtpDelivery {
  return {
    channel: delivery.channel,
    provider: delivery.provider,
    delivered: delivery.delivered,
    destination: delivery.destination,
    message: delivery.message,
  };
}
