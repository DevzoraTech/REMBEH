export type BillingPlanContract = {
  code: string;
  name: string;
  amount: number;
  currency: string;
  interval: string;
  durationMonths: number;
  label: string;
  tagline: string;
  compareAtAmount: number | null;
  savingsAmount: number | null;
  badge: 'MOST_POPULAR' | 'BEST_VALUE' | null;
  defaultSelected: boolean;
  standardAmount?: number;
  pricingSource?: 'DEFAULT_PLAN' | 'ORGANIZATION_OVERRIDE' | 'BRANCH_OVERRIDE';
  priceOverrideId?: string | null;
};

export type BranchBillingRowContract = {
  branchId: string;
  branchName: string;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  graceEndsAt: string | null;
  lockedAt: string | null;
  daysUntilPeriodEnd: number | null;
  daysUntilGraceEnd: number | null;
  canCheckout: boolean;
  reminder: string | null;
  plans?: BillingPlanContract[];
  lastUsedAt?: string | null;
};

export type BillingSummaryContract = {
  /** Monthly reference plan (after-trial price). */
  plan: BillingPlanContract;
  /** All active Pro billing periods. */
  plans: BillingPlanContract[];
  trial: {
    active: boolean;
    startsAt: string;
    endsAt: string;
    daysRemaining: number;
  };
  /** organisation = all branches (owner); branch = caller's branch only (manager). */
  scope: 'organisation' | 'branch';
  canPay: boolean;
  branches: BranchBillingRowContract[];
  reminders: string[];
};

export type BillingCheckoutResponseContract = {
  redirectUrl: string;
  merchantReference: string;
  orderTrackingId: string | null;
};

export type ManualMerchantPaymentResponseContract = {
  payment: SubscriptionPaymentRowContract;
  message: string;
};

export type BranchBillingStatusContract = {
  branchId: string | null;
  branchName: string | null;
  status: string | null;
  locked: boolean;
  graceEndsAt: string | null;
  currentPeriodEnd: string | null;
  daysUntilGraceEnd: number | null;
  daysUntilPeriodEnd: number | null;
  trialDaysRemaining: number | null;
  trialEndsAt: string | null;
  planAmount: number;
  planCurrency: string;
  message: string | null;
};

export type SubscriptionPaymentRowContract = {
  id: string;
  date: string;
  branchId: string;
  branchName: string;
  /** subscription = Pro plan; sms = prepaid SMS top-up */
  kind: 'subscription' | 'sms';
  transaction: string;
  periodLabel: string | null;
  amount: number;
  currency: string;
  planCode?: string | null;
  planDurationMonths?: number | null;
  activeUntil?: string | null;
  transactionId?: string | null;
  verifiedAt?: string | null;
  verifiedByName?: string | null;
  failureReason?: string | null;
  /** SMS credits purchased (SMS rows only). */
  credits: number | null;
  paymentMethod: string;
  status: string;
  receipt: string | null;
  canRetry: boolean;
  canCancel?: boolean;
  /** Present for catalogue SMS purchases (retry reuses bundleId). */
  bundleId?: string | null;
};
