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

export type LoanProductsCatalogContract = {
  rates: LoanRateOptionContract[];
  periods: LoanPeriodOptionContract[];
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
