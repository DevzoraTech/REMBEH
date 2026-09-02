export type LoanRepaymentFrequencyContract =
  | 'DAILY'
  | 'WEEKLY'
  | 'BIWEEKLY'
  | 'MONTHLY'
  | 'LUMP_SUM';

export type LoanListItemContract = {
  id: string;

  applicationId:
    | string
    | null;

  customerId: string;

  borrowerName: string;

  phone: string;

  nationalId:
    | string
    | null;

  loanTypeName:
    | string
    | null;

  status: string;

  /**
   * Agreed principal for the loan.
   */
  principal: number;

  /** Amount physically handed to the borrower so far. */
  disbursedAmount: number;

  /** Principal still waiting to be handed to the borrower. */
  pendingDisbursementAmount: number;

  /** Number of physical disbursement events recorded. */
  disbursementCount: number;

  /**
   * Current borrower debt outstanding.
   *
   * Includes:
   * - principal
   * - contractual interest
   * - applied fines where applicable
   *
   * Excludes:
   * - processing fee
   */
  balance: number;

  /**
   * Sum of actual loan repayments recorded.
   *
   * Processing-fee receipts are not loan repayments.
   */
  paidAmount: number;

  /**
   * Submit-time contractual borrower debt snapshot:
   *
   * principal + contractual interest
   *
   * Excludes:
   * - processing fee
   * - subsequently applied fines
   */
  openingBalance:
    | number
    | null;

  /**
   * Sum of applied overdue fines.
   *
   * These are included in the current loan balance once applied.
   */
  finesTotal: number;

  /**
   * Current total borrower obligation:
   *
   * contractual debt + applied fines.
   *
   * Processing fee is excluded.
   *
   * Falls back to balance + paidAmount where the opening
   * snapshot is unavailable.
   */
  totalRepayable: number;

  /**
   * Contractual interest portion of the original borrower debt.
   *
   * Processing fee is excluded.
   */
  expectedInterest: number;

  /**
   * Separate fee collected by the business.
   *
   * This does not form part of borrower debt.
   */
  processingFee: number;

  /**
   * Scheduled amount payable per repayment occurrence.
   *
   * For DAILY this is the daily instalment.
   * For WEEKLY this is the weekly instalment.
   * For BIWEEKLY this is the biweekly instalment.
   * For MONTHLY this is the monthly instalment.
   * For LUMP_SUM this represents the contractual lump-sum due amount.
   *
   * Field name retained for API compatibility.
   */
  installmentAmount: number;

  /**
   * Number of contractual repayment occurrences currently missed.
   *
   * This must follow repaymentFrequency rather than assuming
   * every loan has a daily schedule.
   *
   * Zero means the borrower is not currently in arrears.
   */
  overdueDays: number;

  /**
   * Human-readable schedule state.
   *
   * Examples:
   * - Due today
   * - Due in 1 day
   * - Due in 7 days
   * - Overdue
   * - Paid up
   */
  nextDueLabel: string;

  /**
   * True only where a contractual repayment is actually due today.
   *
   * Before paymentStartDate this must be false.
   */
  nextDueIsToday: boolean;

  /** Amount recorded against this loan on the current business day. */
  paidTodayAmount: number;

  /**
   * Operational follow-up bucket for today.
   * Does not change outstanding or instalment coverage.
   */
  dueDayCoverage:
    | 'due_paid'
    | 'due_unpaid'
    | 'overdue_paid'
    | 'overdue_unpaid'
    | 'none';

  /**
   * Next contractual repayment date in ISO format.
   *
   * Null when the loan has been paid/closed.
   */
  nextDueDate:
    | string
    | null;

  currency: string;

  officerName:
    | string
    | null;

  officerPublicId:
    | string
    | null;

  branchId: string;

  /**
   * First contractual repayment date.
   *
   * This is generated from the product's payment-start policy:
   * SAME_DAY, NEXT_DAY or AFTER_N_DAYS.
   */
  paymentStartDate:
    | string
    | null;

  /**
   * Contractual term represented in calendar days.
   */
  durationDays:
    | number
    | null;

  /**
   * Contractual repayment frequency captured from the
   * loan product template at application time.
   */
  repaymentFrequency:
    LoanRepaymentFrequencyContract;

  /**
   * Final contractual repayment date.
   *
   * The central collection schedule engine is the source of truth
   * for this value.
   */
  dueDate:
    | string
    | null;

  createdAt: string;

  disbursedAt:
    | string
    | null;

  updatedAt: string;

  reminder: {
    status:
      | 'sent'
      | 'not_sent'
      | 'queued'
      | 'sending'
      | 'failed';

    lastSentAt:
      | string
      | null;

    lastFailureReason:
      | string
      | null;

    canResend:
      boolean;

    activeBatchId:
      | string
      | null;
  };
};

export type LoanListResponseContract = {
  loans:
    LoanListItemContract[];
};

export type LoanDisbursementContract = {
  id: string;
  loanId: string;
  amount: number;
  assignedFloatAmount: number;
  collectedRepaymentsAmount: number;
  source: 'ASSIGNED_FLOAT' | 'COLLECTED_REPAYMENTS' | 'MIXED_CASH';
  disbursedAt: string;
  note: string | null;
  recordedByName: string;
  recordedByPublicId: string | null;
  createdAt: string;
};

export type PendingDisbursementContract = {
  loanId: string;
  applicationId: string | null;
  customerId: string;
  borrowerName: string;
  phone: string;
  branchId: string;
  branchName: string | null;
  agreedAmount: number;
  disbursedAmount: number;
  remainingAmount: number;
  percentDisbursed: number;
  disbursementCount: number;
  lastDisbursementAt: string | null;
  lastDisbursementAmount: number | null;
  issuedByName: string | null;
  issuedByPublicId: string | null;
  status: string;
  createdAt: string;
  disbursements: LoanDisbursementContract[];
};

export type PendingDisbursementListResponseContract = {
  summary: {
    borrowersCount: number;
    totalRemaining: number;
  };
  pendingDisbursements: PendingDisbursementContract[];
};

export type RecordLoanDisbursementResponseContract = {
  pending: PendingDisbursementContract | null;
  loan: Omit<LoanListItemContract, 'reminder'> | null;
  disbursement: LoanDisbursementContract;
};
