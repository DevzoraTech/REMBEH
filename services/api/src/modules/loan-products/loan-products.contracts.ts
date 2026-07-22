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

export type LoanFinePolicyContract = {
  id: string;
  tenantId: string;
  branchId: string | null;
  finePeriodDays: number;
  fineAmount: number;
  isActive: boolean;
  description: string;
  createdAt: string;
  updatedAt: string;
};

export type LoanProductTemplateContract = {
  id: string;
  tenantId: string;
  branchId: string | null;
  name: string;
  description: string | null;
  interestRatePercent: number;
  interestType: 'FLAT' | 'REDUCING_BALANCE' | 'COMPOUND';
  termValue: number;
  termUnit: 'DAYS' | 'WEEKS' | 'MONTHS' | 'YEARS';
  /** Derived duration in days for schedules / fines. */
  durationDays: number;
  repaymentFrequency: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'LUMP_SUM';
  processingFeePercent: number;
  /** Fine = this % of original principal each finePeriodDays after maturity. */
  penaltyRatePercent: number;
  finePeriodDays: number;
  /** When repayments begin relative to loan go-live. */
  paymentStartPolicy: 'SAME_DAY' | 'NEXT_DAY' | 'AFTER_N_DAYS';
  /** Used when paymentStartPolicy = AFTER_N_DAYS. */
  paymentStartDelayDays: number | null;
  allowAgentDatePick: boolean;
  minLoanAmount: number | null;
  maxLoanAmount: number | null;
  notes: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type LoanProductsCatalogContract = {
  /** Preferred source of truth for agent loan capture. */
  templates: LoanProductTemplateContract[];
  /** @deprecated Prefer templates — kept for legacy clients. */
  rates: LoanRateOptionContract[];
  /** @deprecated Prefer templates — kept for legacy clients. */
  periods: LoanPeriodOptionContract[];
  /** @deprecated Prefer template.paymentStartPolicy — legacy branch/tenant fallback. */
  paymentStartPolicy: PaymentStartPolicyContract | null;
  /** @deprecated Prefer template penalty — legacy fixed-amount fallback. */
  finePolicy: LoanFinePolicyContract | null;
};

export type LoanPricingBreakdownContract = {
  principalAmount: number;
  interestRatePercent: number;
  durationDays: number;
  processingFee: number;
  /**
   * Interest preview: principal × (rate% / 100) for all types today.
   * REDUCING_BALANCE / COMPOUND use the same interim until amortization.
   */
  interestAmount: number;
  /** principal + interestAmount + processingFee */
  totalRepayable: number;
};
