export type LoanListItemContract = {
  id: string;
  applicationId: string | null;
  customerId: string;
  borrowerName: string;
  phone: string;
  nationalId: string | null;
  loanTypeName: string | null;
  status: string;
  principal: number;
  balance: number;
  paidAmount: number;
  /** Submit-time principal + interest + fee (excludes later fines). */
  openingBalance: number | null;
  /** Sum of applied overdue fines (included in balance). */
  finesTotal: number;
  /**
   * Full obligation: openingBalance + finesTotal
   * (falls back to balance + paidAmount when opening is missing).
   */
  totalRepayable: number;
  /** Interest portion of opening balance (excludes processing fee). */
  expectedInterest: number;
  processingFee: number;
  installmentAmount: number;
  /** Missed repayment days on the daily schedule (0 when current/paid). */
  overdueDays: number;
  nextDueLabel: string;
  nextDueIsToday: boolean;
  /** Next installment calendar date (ISO), or null when paid/closed. */
  nextDueDate: string | null;
  currency: string;
  officerName: string | null;
  officerPublicId: string | null;
  branchId: string;
  paymentStartDate: string | null;
  durationDays: number | null;
  /** Maturity date (payment start + duration). */
  dueDate: string | null;
  createdAt: string;
  disbursedAt: string | null;
  updatedAt: string;
};

export type LoanListResponseContract = {
  loans: LoanListItemContract[];
};
