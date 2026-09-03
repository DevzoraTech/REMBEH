export type BranchOperationStatusContract = 'OPEN' | 'CLOSING' | 'CLOSED';

export type DailyOperationReportStatusContract =
  | 'MANAGER_REVIEW'
  | 'SENT_TO_OWNER'
  | 'OWNER_APPROVED'
  | 'RETURNED_TO_MANAGER';

export type DailyOperationBranchContract = {
  id: string;
  name: string;
  address: string;
};

export type DailyOperationBranchAccessContract = {
  canOperate: boolean;
  locked: boolean;
  subscriptionStatus: string | null;
  message: string | null;
};

export type DailyOperationExpensePaidFromContract =
  | 'BRANCH_CASH'
  | 'AGENT_FLOAT';

export type DailyOperationExpenseContract = {
  id: string;
  amount: number;
  description: string | null;
  paidFrom: DailyOperationExpensePaidFromContract;
  agentId: string | null;
  agentName: string | null;
  incurredAt: string;
  recordedByName: string;

  approvedAt: string | null;
  approvedByName: string | null;

  voidedAt: string | null;
  voidedByName: string | null;
  voidReason: string | null;
};

export type DailyOperationSalaryContract = {
  id: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  method: string;
  paidAt: string;
  recordedByName: string;
  reversedAt: string | null;
};

export type DailyOperationTopUpContract = {
  id: string;
  amount: number;
  description: string | null;
  addedAt: string;
  recordedByName: string;
};

export type DailyOperationAgentReturnStatusContract =
  | 'PENDING'
  | 'RETURNED'
  | 'SHORT'
  | 'OVER';

export type DailyOperationAgentReturnContract = {
  floatId: string;
  agentId: string;
  agentName: string;
  agentPublicId: string | null;
  agentPhone: string | null;
  agentRoleName: string | null;
  agentPhotoUrl: string | null;
  amountGiven: number;
  amountDisbursed: number;
  processingFees: number;
  amountCollected: number;
  expensesTotal: number;
  expectedReturn: number;
  amountReturned: number | null;
  variance: number | null;
  returnedAt: string | null;
  returnedByName: string | null;
  notes: string | null;
  status: DailyOperationAgentReturnStatusContract;
};

export type DailyOperationProductBreakdownContract = {
  product: string;
  count: number;
  amount: number;
  recoveredToday?: number;
  outstandingBalance?: number;
};

export type DailyOperationLoanIssuedContract = {
  id: string;
  loanId: string | null;
  borrowerName: string;
  borrowerPhone: string | null;
  product: string;
  principalAmount: number;
  processingFee: number;
  recoveredToday: number;
  outstandingBalance: number;
  issuedAt: string;
  officerName: string;
  officerPublicId: string | null;
  durationDays: number | null;
  purpose: string | null;
};

export type DailyOperationRepaymentContract = {
  id: string;
  loanId: string;
  borrowerName: string;
  borrowerPhone: string | null;
  product: string;
  amount: number;
  paidAt: string;
  method: string;
  receiptNumber: string | null;
  recordedByName: string;
  recordedByPublicId: string | null;
  note: string | null;
};

export type DailyOperationProcessingFeeContract = {
  id: string;
  loanId: string | null;
  borrowerName: string;
  product: string;
  amount: number;
  receivedAt: string;
  officerName: string;
};

export type DailyOperationVarianceContract = {
  id: string;
  source: string;
  personName: string;
  personPublicId: string | null;
  expectedAmount: number | null;
  actualAmount: number | null;
  variance: number;
  shortageAmount: number | null;
  outstandingAmount: number | null;
  status: string;
  notes: string | null;
  occurredAt: string;
};

/**
 * Immutable history entry for a physical cash count entered
 * while reconciling a branch day.
 */
export type BranchOperationCashCountContract = {
  id: string;
  previousAmount: number | null;
  countedAmount: number;
  recordedAt: string;
  recordedByName: string;
};

/**
 * Working reconciliation state for an operation.
 *
 * countedCash is deliberately separate from closingBalance.
 * It may be updated repeatedly until the manager finally closes the day.
 */
export type BranchOperationReconciliationContract = {
  id: string;
  operationId: string;
  branchId: string;

  countedCash: number | null;
  expectedClosingBalance: number;
  variance: number | null;

  notes: string | null;

  startedAt: string;
  startedByName: string;

  updatedAt: string;
  updatedByName: string | null;

  cashCounts: BranchOperationCashCountContract[];
};

export type DailyOperationContract = {
  id: string;
  branchId: string;
  branchName: string;
  operationDate: string;
  status: BranchOperationStatusContract;

  openedAt: string;
  openedByName: string;
  closedAt: string | null;
  closedByName: string | null;

  openingBalance: number;
  cashAddedToday: number;
  cashAvailableAtOpening: number;

  floatIssued: number;
  floatSetAside: number;
  floatRemaining: number;

  processingFeesTotal: number;
  cashReturnedByAgents: number;

  agentsWithFloatCount: number;
  agentsReturnedCount: number;
  expectedAgentReturnTotal: number;
  agentReturnVariance: number;
  agentReturns: DailyOperationAgentReturnContract[];

  topUpsCount: number;
  topUpsTotal: number;
  topUps: DailyOperationTopUpContract[];

  expensesCount: number;
  expensesTotal: number;
  branchCashExpensesTotal: number;
  agentFloatExpensesTotal: number;
  expenses: DailyOperationExpenseContract[];

  salariesCount: number;
  salariesTotal: number;
  salaries: DailyOperationSalaryContract[];

  branchCashRemaining: number;
  expectedClosingBalance: number;

  /**
   * Lightweight reconciliation fields used by the operations UI.
   */
  reconciliationStarted: boolean;
  reconciliationCountedCash: number | null;
  reconciliationVariance: number | null;

  /**
   * Final close values.
   *
   * These remain null until the branch is actually closed.
   */
  closingBalance: number | null;
  closingVariance: number | null;
  closingNotes: string | null;

  loansIssuedCount: number;
  loansIssuedPrincipal: number;

  collectionsCount: number;
  collectionsReceived: number;

  notes: string | null;

  loansByProduct: DailyOperationProductBreakdownContract[];
  repaymentsByProduct: DailyOperationProductBreakdownContract[];
  feesByProduct: DailyOperationProductBreakdownContract[];

  loansIssued: DailyOperationLoanIssuedContract[];
  repayments: DailyOperationRepaymentContract[];
  processingFees: DailyOperationProcessingFeeContract[];

  variances: DailyOperationVarianceContract[];

  previousReportReference: {
    reportNumber: string;
    operationDate: string;
    amount: number;
  } | null;
};

export type DailyOperationReportContract = {
  id: string;
  operationId: string;
  reportNumber: string;
  operationDate: string;
  status: DailyOperationReportStatusContract;

  generatedAt: string;

  managerReviewedAt: string | null;
  managerReviewedByName: string | null;
  managerNotes: string | null;

  ownerApprovedAt: string | null;
  ownerApprovedByName: string | null;
  ownerNotes: string | null;

  returnedAt: string | null;
  returnedByName: string | null;
  returnNotes: string | null;

  snapshot: unknown;
};

export type DailyOperationCarryoverContract = {
  id: string;
  branchId: string;
  branchName: string;
  operationDate: string;
  status: BranchOperationStatusContract;
  openedAt: string;
};

export type DailyOperationResponseContract = {
  date: string;

  branch: DailyOperationBranchContract | null;

  branchAccess: DailyOperationBranchAccessContract | null;

  openingBalance: number | null;
  openingBalanceSource: 'PREVIOUS_CLOSING' | 'MANUAL';

  previousClosedOperation: DailyOperationCarryoverContract | null;

  pendingClosureOperation: DailyOperationCarryoverContract | null;

  /**
   * Previous day is closed but its report has not been submitted yet.
   * This blocks automatic opening of the following business day.
   */
  awaitingReportOperation: DailyOperationCarryoverContract | null;

  operation: DailyOperationContract | null;

  /**
   * Full working reconciliation state.
   *
   * Null until reconciliation has been started for the current operation.
   */
  reconciliation: BranchOperationReconciliationContract | null;

  report: DailyOperationReportContract | null;
};

/**
 * Useful when the reconciliation workflow returns the completed close result.
 *
 * This gives the mobile client the complete operation, reconciliation,
 * and generated report without needing to reconstruct state locally.
 */
export type ReconciliationSubmitResultContract = {
  operation: DailyOperationContract;
  reconciliation: BranchOperationReconciliationContract;
  report: DailyOperationReportContract;
};

export type OwnerOperationReportListItemContract = {
  id: string;
  operationId: string;
  branchId: string;
  branchName: string;
  reportNumber: string;
  operationDate: string;
  status: DailyOperationReportStatusContract;

  generatedAt: string;

  managerReviewedAt: string | null;
  managerReviewedByName: string | null;
  managerNotes: string | null;

  ownerApprovedAt: string | null;
  ownerApprovedByName: string | null;
  ownerNotes: string | null;

  returnedAt: string | null;
  returnedByName: string | null;
  returnNotes: string | null;

  expectedClosingBalance: number;
  closingBalance: number | null;
  closingVariance: number | null;

  loansIssuedCount: number;
  loansIssuedPrincipal: number;

  collectionsReceived: number;
  processingFeesTotal: number;
  expensesTotal: number;

  cashReturnedByAgents: number;

  snapshot: unknown;
};

export type OwnerOperationReportDetailResponseContract = {
  report: OwnerOperationReportListItemContract;
};

export type OwnerOperationReportListResponseContract = {
  reports: OwnerOperationReportListItemContract[];
};

export type OwnerBranchDailyStatusContract = {
  branchId: string;
  branchName: string;
  operationDate: string;

  operationId: string | null;
  operationStatus: BranchOperationStatusContract | null;

  openedAt: string | null;
  closedAt: string | null;

  reportId: string | null;
  reportNumber: string | null;
  reportStatus: DailyOperationReportStatusContract | null;
  reportGeneratedAt: string | null;
  managerReviewedAt: string | null;
};

export type OwnerBranchDailyStatusResponseContract = {
  date: string;
  statuses: OwnerBranchDailyStatusContract[];
};

export type AgentDailyAccessReasonContract =
  | 'NO_BRANCH'
  | 'BRANCH_NOT_OPEN'
  | 'BRANCH_CLOSED'
  | 'AGENT_DAY_CLOSED'
  | 'BEFORE_OPEN_HOUR'
  | null;

export type AgentDailyFloatSummaryContract = {
  amountReceived: number;
  amountDisbursed: number;
  processingFees: number;
  amountCollected: number;
  collectedRepaymentsAvailable: number;
  unusedFloat: number;
  expectedHandover: number;
  expensesTotal: number;
  expenses: DailyOperationExpenseContract[];

  amountReturned: number | null;
  returnedAt: string | null;
};

export type AgentDailyOperationResponseContract = {
  date: string;

  branch: DailyOperationBranchContract | null;

  branchStatus: BranchOperationStatusContract | null;

  canUseApp: boolean;

  /**
   * Client records/search remain available while financial operations
   * are temporarily locked.
   */
  canBrowseClients: boolean;

  lockReason: AgentDailyAccessReasonContract;
  lockTitle: string | null;
  lockMessage: string | null;

  canRecordExpense: boolean;

  float: AgentDailyFloatSummaryContract;
};