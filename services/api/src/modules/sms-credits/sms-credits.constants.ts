/**
 * Branch SMS prepaid pricing (server-only).
 *
 * Branches buy message credits. Supplier tariffs and company margin must never
 * appear in API responses, logs shown to tenants, or the web UI.
 */
export const BRANCH_SMS_UNIT_PRICE_UGX = 500;

/** Suggested top-up amounts shown in the app (UGX). */
export const BRANCH_SMS_TOP_UP_PRESETS_UGX = [10_000, 20_000, 50_000] as const;

export function creditsForTopUpAmount(amountUgx: number): number {
  if (!Number.isFinite(amountUgx) || amountUgx <= 0) return 0;
  return Math.floor(amountUgx / BRANCH_SMS_UNIT_PRICE_UGX);
}
