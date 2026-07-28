export type BranchOperationStatusContract = 'OPEN' | 'CLOSING' | 'CLOSED';

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

export type DailyOperationContract = {
  id: string;
  branchId: string;
  branchName: string;
  operationDate: string;
  status: BranchOperationStatusContract;
  openedAt: string;
  openedByName: string;
  closedAt: string | null;
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
  operation: DailyOperationContract | null;
};

export type AgentDailyAccessReasonContract =
  'NO_BRANCH' | 'BRANCH_NOT_OPEN' | 'BRANCH_CLOSED' | 'AGENT_DAY_CLOSED' | null;

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
  lockReason: AgentDailyAccessReasonContract;
  lockTitle: string | null;
  lockMessage: string | null;
  float: AgentDailyFloatSummaryContract;
};
