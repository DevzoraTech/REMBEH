export type LoanRateOptionContract = {
  id: string;
  tenantId: string;
  branchId: string | null;
  label: string;
  interestRatePercent: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type LoanPeriodOptionContract = {
  id: string;
  tenantId: string;
  branchId: string | null;
  label: string;
  durationDays: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type PaymentStartPolicyContract = {
  id: string;
  tenantId: string;
  branchId: string | null;
  policyType: 'SAME_DAY' | 'NEXT_DAY' | 'AFTER_N_DAYS';
  afterDays: number | null;
  allowAgentDatePick: boolean;
  isActive: boolean;
  description: string;
  createdAt: string;
  updatedAt: string;
};

export type LoanProductsCatalogContract = {
  rates: LoanRateOptionContract[];
  periods: LoanPeriodOptionContract[];
  /** Effective policy for the caller's branch (branch override or tenant default). */
  paymentStartPolicy: PaymentStartPolicyContract | null;
};

export type LoanPricingBreakdownContract = {
  principalAmount: number;
  interestRatePercent: number;
  durationDays: number;
  processingFee: number;
  /** Simple interest: principal × rate% × (days / 365). */
  interestAmount: number;
  /** principal + interestAmount + processingFee */
  totalRepayable: number;
};
