export type BillingPlanContract = {
  code: string;
  name: string;
  amount: number;
  currency: string;
  interval: string;
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
};

export type BillingSummaryContract = {
  plan: BillingPlanContract;
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
  transaction: string;
  periodLabel: string | null;
  amount: number;
  currency: string;
  paymentMethod: string;
  status: string;
  receipt: string | null;
  canRetry: boolean;
};
