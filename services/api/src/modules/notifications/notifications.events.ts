export const NOTIFICATION_EVENTS = {
  emailOtpRequested: 'notification.email_otp.requested',
  emailOtpSent: 'notification.email_otp.sent',
  emailOtpDeliveryFailed: 'notification.email_otp.delivery_failed',
  phoneOtpRequested: 'notification.phone_otp.requested',
  phoneOtpSent: 'notification.phone_otp.sent',
  phoneOtpDeliveryFailed: 'notification.phone_otp.delivery_failed',
  staffInvitationEmailSent: 'notification.staff_invitation_email.sent',
  staffInvitationEmailFailed: 'notification.staff_invitation_email.failed',
} as const;
