export const BILLING_PERMISSIONS = {
  manage: 'billing.manage',
} as const;

export const BILLING_PERMISSION_LIST = Object.values(BILLING_PERMISSIONS);

/** Legacy + monthly Pro plan code (kept for existing branch subscriptions). */
export const PRO_PLAN_CODE = 'PRO';
export const PRO_3M_PLAN_CODE = 'PRO_3M';
export const PRO_6M_PLAN_CODE = 'PRO_6M';

export const TRIAL_DAYS = 30;
export const GRACE_DAYS = 2;

export type ProPlanDefinition = {
  code: string;
  name: string;
  amountUgx: number;
  /** List price before discount (for savings display). */
  compareAtUgx: number | null;
  interval: 'MONTHLY' | 'THREE_MONTHS' | 'SIX_MONTHS';
  durationMonths: number;
  label: string;
  tagline: string;
  badge: 'MOST_POPULAR' | 'BEST_VALUE' | null;
  defaultSelected: boolean;
};

/**
 * Live Pro catalogue. Monthly list price UGX 255,000.
 * 3 / 6 month prepaid discounts vs monthly × duration.
 */
export const PRO_PLAN_CATALOGUE: ProPlanDefinition[] = [
  {
    code: PRO_PLAN_CODE,
    name: 'Pro',
    amountUgx: 255_000,
    compareAtUgx: null,
    interval: 'MONTHLY',
    durationMonths: 1,
    label: 'Monthly',
    tagline: 'Maximum flexibility',
    badge: null,
    defaultSelected: false,
  },
  {
    code: PRO_3M_PLAN_CODE,
    name: 'Pro',
    amountUgx: 725_000,
    compareAtUgx: 765_000,
    interval: 'THREE_MONTHS',
    durationMonths: 3,
    label: '3 months',
    tagline: 'Most popular',
    badge: 'MOST_POPULAR',
    defaultSelected: true,
  },
  {
    code: PRO_6M_PLAN_CODE,
    name: 'Pro',
    amountUgx: 1_385_000,
    compareAtUgx: 1_530_000,
    interval: 'SIX_MONTHS',
    durationMonths: 6,
    label: '6 months',
    tagline: 'Best value',
    badge: 'BEST_VALUE',
    defaultSelected: false,
  },
];

/** Monthly reference price shown as “after trial”. */
export const PRO_MONTHLY_AMOUNT_UGX = PRO_PLAN_CATALOGUE[0]!.amountUgx;

export function proPlanByCode(code: string): ProPlanDefinition | undefined {
  return PRO_PLAN_CATALOGUE.find((plan) => plan.code === code);
}

export function defaultProPlanCode(): string {
  return (
    PRO_PLAN_CATALOGUE.find((plan) => plan.defaultSelected)?.code ??
    PRO_3M_PLAN_CODE
  );
}

export function monthsForInterval(
  interval: 'MONTHLY' | 'THREE_MONTHS' | 'SIX_MONTHS' | string,
): number {
  switch (interval) {
    case 'THREE_MONTHS':
      return 3;
    case 'SIX_MONTHS':
      return 6;
    default:
      return 1;
  }
}
