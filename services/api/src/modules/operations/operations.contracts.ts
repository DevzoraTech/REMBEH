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
  expensesCount: number;
  expensesTotal: number;
  expenses: DailyOperationExpenseContract[];
  branchCashRemaining: number;
  closingBalance: number | null;
  loansIssuedCount: number;
  loansIssuedPrincipal: number;
  collectionsCount: number;
  collectionsReceived: number;
  notes: string | null;
};

export type DailyOperationResponseContract = {
  date: string;
  branch: DailyOperationBranchContract | null;
  openingBalance: number | null;
  operation: DailyOperationContract | null;
};
