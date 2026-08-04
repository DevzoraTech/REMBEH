export type BranchOperationStatusContract = 'OPEN' | 'CLOSING' | 'CLOSED';

export type DailyOperationReportStatusContract =
  'MANAGER_REVIEW' | 'SENT_TO_OWNER' | 'OWNER_APPROVED' | 'RETURNED_TO_MANAGER';

export type DailyOperationBranchContract = {
  id: string;
  name: string;
  address: string;
};

export type DailyOperationExpenseCategoryContract =
  | 'TRANSPORT'
  | 'FUEL'
  | 'MEALS'
  | 'AIRTIME'
  | 'MOBILE_MONEY_CHARGES'
  | 'STATIONERY'
  | 'REPAIRS'
  | 'UTILITIES'
  | 'OTHER';

export type DailyOperationExpenseContract = {
  id: string;
  category: DailyOperationExpenseCategoryContract;
  amount: number;
  description: string | null;
  incurredAt: string;
  recordedByName: string;
  approvedAt: string | null;
  approvedByName: string | null;
};

export type DailyOperationTopUpContract = {
  id: string;
  amount: number;
  description: string | null;
  addedAt: string;
  recordedByName: string;
};

export type DailyOperationAgentReturnStatusContract =
  'PENDING' | 'RETURNED' | 'SHORT' | 'OVER';

export type DailyOperationAgentReturnContract = {
  floatId: string;
  agentId: string;
  agentName: string;
  agentPublicId: string | null;
  amountGiven: number;
  amountDisbursed: number;
  processingFees: number;
  amountCollected: number;
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
  expenses: DailyOperationExpenseContract[];
  branchCashRemaining: number;
  expectedClosingBalance: number;
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
  openingBalance: number | null;
  openingBalanceSource: 'PREVIOUS_CLOSING' | 'MANUAL';
  previousClosedOperation: DailyOperationCarryoverContract | null;
  pendingClosureOperation: DailyOperationCarryoverContract | null;
  /** Previous day is closed but its report is not submitted yet — blocks auto-open. */
  awaitingReportOperation: DailyOperationCarryoverContract | null;
  operation: DailyOperationContract | null;
  report: DailyOperationReportContract | null;
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
  unusedFloat: number;
  expectedHandover: number;
  amountReturned: number | null;
  returnedAt: string | null;
};

export type AgentDailyOperationResponseContract = {
  date: string;
  branch: DailyOperationBranchContract | null;
  branchStatus: BranchOperationStatusContract | null;
  canUseApp: boolean;
  /** Client records / search allowed while money work is locked. */
  canBrowseClients: boolean;
  lockReason: AgentDailyAccessReasonContract;
  lockTitle: string | null;
  lockMessage: string | null;
  float: AgentDailyFloatSummaryContract;
};
