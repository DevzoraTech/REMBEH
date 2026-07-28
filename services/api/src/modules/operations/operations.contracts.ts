export type BranchOperationStatusContract = 'OPEN' | 'CLOSING' | 'CLOSED';

export type DailyOperationBranchContract = {
  id: string;
  name: string;
  address: string;
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
  cashInVault: number;
  cashInSafe: number;
  openingFloatAvailable: number;
  previousClosingBalance: number;
  totalOpeningCash: number;
  floatIssued: number;
  cashRemainingForFloat: number;
  loansIssuedCount: number;
  loansIssuedPrincipal: number;
  collectionsCount: number;
  collectionsReceived: number;
  expectedCashNow: number;
  notes: string | null;
};

export type DailyOperationResponseContract = {
  date: string;
  branch: DailyOperationBranchContract | null;
  operation: DailyOperationContract | null;
};
