import { ControlCenterMessageChannel } from '@prisma/client';

export const DEFAULT_CONTROL_CENTER_MESSAGE_TEMPLATES = [
  {
    code: 'subscription_offer_email',
    name: 'Subscription price offer',
    channel: ControlCenterMessageChannel.EMAIL,
    subject: 'Your REMBEH subscription offer',
    body: 'Hello {{name}},\n\nWe have prepared a custom REMBEH subscription offer for {{organization}}. Reply to this email or contact the ANTIKRA team to activate it.\n\nRegards,\nANTIKRA',
  },
  {
    code: 'renewal_reminder_email',
    name: 'Renewal reminder',
    channel: ControlCenterMessageChannel.EMAIL,
    subject: 'REMBEH subscription renewal reminder',
    body: 'Hello {{name}},\n\nYour REMBEH subscription for {{organization}} is due for renewal soon. Please complete payment to avoid service interruption.\n\nRegards,\nANTIKRA',
  },
  {
    code: 'marketing_update_sms',
    name: 'Marketing SMS',
    channel: ControlCenterMessageChannel.SMS,
    subject: null,
    body: 'REMBEH update: {{organization}} can now manage daily operations, salaries, and reports more smoothly. Contact ANTIKRA for help.',
  },
  {
    code: 'subscription_locked_sms',
    name: 'Locked branch SMS',
    channel: ControlCenterMessageChannel.SMS,
    subject: null,
    body: 'REMBEH notice: {{branch}} subscription needs attention. Renew to restore full access. ANTIKRA support is available.',
  },
  {
    code: 'pricing_update_email',
    name: 'Pricing update',
    channel: ControlCenterMessageChannel.EMAIL,
    subject: 'REMBEH pricing update for {{organization}}',
    body: 'Hello {{name}},\n\nWe have updated REMBEH subscription pricing for {{organization}}. Branch-specific pricing still applies where it has been agreed.\n\nOpen your subscription page to view the latest amount before making a payment.\n\nRegards,\nREMBEH Billing',
  },
  {
    code: 'branch_manager_notice_email',
    name: 'Branch manager notice',
    channel: ControlCenterMessageChannel.EMAIL,
    subject: 'REMBEH notice for {{branch}}',
    body: 'Hello {{name}},\n\nThis is an important REMBEH update for {{branch}} under {{organization}}.\n\n{{branch}} teams should review the app for the latest operational and subscription information.\n\nRegards,\nREMBEH Operations',
  },
  {
    code: 'field_officer_campaign_sms',
    name: 'Field officer SMS',
    channel: ControlCenterMessageChannel.SMS,
    subject: null,
    body: 'REMBEH update for {{branch}}: Please sync your app while online before field work and keep records up to date. ANTIKRA support is available.',
  },
  {
    code: 'manager_campaign_sms',
    name: 'Manager SMS',
    channel: ControlCenterMessageChannel.SMS,
    subject: null,
    body: 'REMBEH manager notice: Review {{branch}} subscriptions, daily operations, and staff access when online. Contact ANTIKRA for support.',
  },
  {
    code: 'service_announcement_email',
    name: 'Service announcement',
    channel: ControlCenterMessageChannel.EMAIL,
    subject: 'REMBEH service announcement',
    body: 'Hello {{name}},\n\nWe are sharing an update that affects REMBEH service for {{organization}}.\n\nPlease review the app and contact ANTIKRA support if your team needs help.\n\nRegards,\nREMBEH Support',
  },
] as const;
