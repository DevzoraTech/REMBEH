/**
 * Branch SMS prepaid — catalogue-driven bundles (server prices only).
 * Frontend must never send price or unit counts on purchase.
 */

/** Pahappa/provider cost per billed SMS. Orgs pay a higher bundle rate; the gap is reserve. */
export const PLATFORM_SMS_PROVIDER_COST_UGX = 35;

export function smsPurchaseReserveUgx(amountUgx: number, smsUnits: number) {
  return Math.round(amountUgx - smsUnits * PLATFORM_SMS_PROVIDER_COST_UGX);
}

/** One-time SMS credits granted on a branch's first Pro plan purchase. */
export const PRO_PLAN_WELCOME_SMS_CREDITS = 140;

/** Reuse an unexpired pending purchase for the same branch+bundle+user. */
export const SMS_PURCHASE_DUPLICATE_WINDOW_MS = 5 * 60 * 1000;

/** How long a checkout stays payable before expiry. */
export const SMS_PURCHASE_EXPIRES_MS = 30 * 60 * 1000;

/** Ledger reference type for Pro welcome grant (idempotent per branch). */
export const SMS_WELCOME_GRANT_REFERENCE_TYPE = 'pro_welcome_grant';

/** Hold uncertain provider responses before reconciliation releases the reserve. */
export const SMS_UNCERTAIN_RESERVATION_TTL_MS = 15 * 60 * 1000;

/** Stale RESERVED rows (send never finished) are released by the reconciler. */
export const SMS_RESERVED_STALE_TTL_MS = 10 * 60 * 1000;

/** Statuses that may be retried by a user (not uncertain — control #7). */
export const SMS_RETRYABLE_STATUSES = [
  'PROVIDER_FAILED',
  'BLOCKED_PROVIDER_UNAVAILABLE',
  'FAILED_VALIDATION',
  'FAILED_INSUFFICIENT_CREDITS',
  'RELEASED',
] as const;
