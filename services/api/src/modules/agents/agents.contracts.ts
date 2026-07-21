export type AgentStatusContract =
  | 'INVITED'
  | 'PENDING_VERIFICATION'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'INACTIVE';

export type AgentListItemContract = {
  id: string;
  publicId: string | null;
  name: string;
  email: string;
  phone: string | null;
  status: AgentStatusContract;
  roleName: string | null;
  branchId: string | null;
  branchName: string | null;
  photoUrl: string | null;
  collectionsToday: number;
  collectionsLifetime: number;
  applicationsToday: number;
  applicationsLifetime: number;
  amountCollectedLifetime: number;
  amountDisbursedLifetime: number;
  amountCollectedToday: number;
  amountDisbursedToday: number;
  floatToday: number | null;
};

export type AgentsListResponse = {
  agents: AgentListItemContract[];
  counts: {
    total: number;
    active: number;
    suspended: number;
    inactive: number;
  };
};

export type AgentDailyFloatContract = {
  id: string;
  agentId: string;
  floatDate: string;
  amountGiven: number;
  notes: string | null;
  recordedByName: string;
  recordedAt: string;
};

/**
 * End-of-day accountability:
 * expectedCash = amountGiven − disbursed (new loans) + collected (repayments)
 */
export type AgentAccountabilityContract = {
  date: string;
  amountGiven: number;
  amountDisbursed: number;
  amountCollected: number;
  expectedCash: number;
  formula: string;
};

export type AgentDetailContract = {
  id: string;
  publicId: string | null;
  name: string;
  email: string;
  phone: string | null;
  status: AgentStatusContract;
  roleName: string | null;
  branchId: string | null;
  branchName: string | null;
  photoUrl: string | null;
  accountability: AgentAccountabilityContract;
  float: AgentDailyFloatContract | null;
  collectionsToday: number;
  collectionsLifetime: number;
  applicationsToday: number;
  applicationsLifetime: number;
  amountCollectedLifetime: number;
  amountDisbursedLifetime: number;
};

export type AgentActivityApplicationContract = {
  id: string;
  clientName: string;
  phone: string | null;
  principalAmount: number;
  status: string;
  submittedAt: string;
  loanId: string | null;
};

export type AgentActivityCollectionContract = {
  id: string;
  loanId: string;
  clientName: string;
  phone: string | null;
  amount: number;
  method: string;
  note: string | null;
  paidAt: string;
};

export type AgentActivityResponse = {
  date: string;
  range: 'today' | 'week' | 'all';
  applications: AgentActivityApplicationContract[];
  collections: AgentActivityCollectionContract[];
};
