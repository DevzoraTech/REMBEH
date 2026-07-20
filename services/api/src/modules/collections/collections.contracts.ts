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

export type FineHistoryItemContract = {
  id: string;
  periodIndex: number;
  amount: number;
  dueAt: string;
  appliedAt: string;
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
  /** Original total repayable + applied fines. */
  loanAmount: number;
  interestRatePercent: number;
  interestAmount: number;
  processingFee: number;
  loanStartDate: string;
  /** First repayment day from manager payment-start policy. */
  paymentStartDate: string;
  maturityDate: string;
  status: string;
  /** True once at least one overdue fine has been applied. */
  isFined: boolean;
  /** Sum of applied overdue fines (included in outstanding). */
  finesTotal: number;
  /** Newest-first payment history for wallet views. */
  paymentHistory: PaymentHistoryItemContract[];
  /** Newest-first overdue fine history. */
  fineHistory: FineHistoryItemContract[];
};

export type RecordRepaymentResponseContract = {
  repayment: RepaymentListItemContract;
  detail: ClientLoanDetailContract;
};

export type RepaymentDetailContract = RepaymentListItemContract & {
  companyName: string;
  branchName: string | null;
  branchId: string;
  currency: string;
  loanOutstanding: number | null;
  loanStatus: string | null;
  isFined: boolean;
  finesTotal: number;
};

export type DailyAgentApplicationItemContract = {
  id: string;
  clientName: string;
  phone: string | null;
  principalAmount: number;
  status: string;
  submittedAt: string;
  loanId: string | null;
};

export type DailyAgentPaymentItemContract = {
  id: string;
  loanId: string;
  clientName: string;
  phone: string | null;
  amount: number;
  method: string;
  note: string | null;
  paidAt: string;
};

export type DailyAgentSummaryContract = {
  agentId: string;
  agentName: string;
  agentPublicId: string | null;
  agentPhotoUrl: string | null;
  roleName: string | null;
  branchId: string | null;
  branchName: string | null;
  applicationsCount: number;
  principalLent: number;
  paymentsCount: number;
  amountCollected: number;
  /** amountCollected − principalLent (positive = more cash in than lent). */
  netCash: number;
};

export type DailyCollectionsSummaryContract = {
  date: string;
  timezoneNote: string;
  agents: DailyAgentSummaryContract[];
  totals: {
    applicationsCount: number;
    principalLent: number;
    paymentsCount: number;
    amountCollected: number;
    netCash: number;
  };
};

export type DailyAgentDetailContract = {
  date: string;
  agent: DailyAgentSummaryContract;
  applications: DailyAgentApplicationItemContract[];
  payments: DailyAgentPaymentItemContract[];
};
