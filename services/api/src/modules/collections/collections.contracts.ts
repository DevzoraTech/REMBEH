export type CollectionSummaryContract = {
  amountCollectedToday: number;
  repaymentsTodayCount: number;
  dueTodayCount: number;
  pendingSyncCount: number;
  clientsDueToday: DueClientContract[];
};

export type DueClientContract = {
  id: string;
  loanId: string;
  customerId: string;
  fullName: string;
  phone: string;
  amountPaid: number;
  loanAmount: number;
  amountDue: number;
  lastActivityAt: string;
  synced: boolean;
};

export type RepaymentListItemContract = {
  id: string;
  loanId: string;
  customerId: string;
  clientName: string;
  phone: string;
  amount: number;
  amountPaid: number;
  loanAmount: number;
  recordedAt: string;
  synced: boolean;
  dueToday: boolean;
  note: string | null;
  method: string;
  recordedByName: string;
  recordedByPublicId: string | null;
  /** Presigned GET for the recording agent's profile selfie. */
  agentPhotoUrl: string | null;
  agentPhotoStorageKey: string | null;
};

export type PaymentHistoryItemContract = {
  id: string;
  amount: number;
  method: string;
  paidAt: string;
  recordedByName: string;
  recordedByPublicId: string | null;
  agentPhotoUrl: string | null;
  note: string | null;
};

export type ClientLoanDetailContract = {
  id: string;
  loanId: string;
  /** Client wallet id (one per loan); null only for legacy gaps. */
  walletId: string | null;
  customerId: string;
  fullName: string;
  phone: string;
  registeredBy: string;
  registeredByPublicId: string | null;
  /** Presigned GET for the registering agent's profile selfie. */
  agentPhotoUrl: string | null;
  agentPhotoStorageKey: string | null;
  outstanding: number;
  lastPaymentAmount: number;
  lastPaymentAt: string | null;
  lastPaymentBy: string | null;
  lastPaymentByPhotoUrl: string | null;
  expectedToday: number;
  carriedForward: number;
  dailyInstalment: number;
  loanPeriodDays: number;
  daysLeft: number;
  nextDueLabel: string;
  nextDueIsToday: boolean;
  paidAmount: number;
  loanAmount: number;
  interestRatePercent: number;
  interestAmount: number;
  processingFee: number;
  loanStartDate: string;
  /** First repayment day from manager payment-start policy. */
  paymentStartDate: string;
  maturityDate: string;
  status: string;
  /** Newest-first payment history for wallet views. */
  paymentHistory: PaymentHistoryItemContract[];
};

export type RecordRepaymentResponseContract = {
  repayment: RepaymentListItemContract;
  detail: ClientLoanDetailContract;
};
