export const BILLING_PERMISSIONS = {
  manage: 'billing.manage',
} as const;

export const BILLING_PERMISSION_LIST = Object.values(BILLING_PERMISSIONS);

export const PRO_PLAN_CODE = 'PRO';
/** Temporary: stay within current Pesapal merchant limit (was 150_000). */
export const PRO_PLAN_AMOUNT_UGX = 100_000;
export const TRIAL_DAYS = 30;
export const GRACE_DAYS = 2;
