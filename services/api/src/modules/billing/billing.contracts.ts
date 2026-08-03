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
  branches: BranchBillingRowContract[];
  reminders: string[];
};

export type BillingCheckoutResponseContract = {
  redirectUrl: string;
  merchantReference: string;
  orderTrackingId: string | null;
};
