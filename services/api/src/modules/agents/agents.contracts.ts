export type AgentStatusContract =
  'INVITED' | 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';

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
  /** When the agent account was created. */
  createdAt: string;
  /**
   * Latest meaningful field activity (loan issuance or repayment collection).
   * Null when the agent has never recorded either.
   */
  lastActiveAt: string | null;
  collectionsToday: number;
  collectionsLifetime: number;
  applicationsToday: number;
  applicationsLifetime: number;
  amountCollectedLifetime: number;
  amountDisbursedLifetime: number;
  amountCollectedToday: number;
  amountDisbursedToday: number;
  floatToday: number | null;
  remainingFloatToday: number | null;
  collectedRepaymentsAvailableToday: number;
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
  createdAt: string;
  /** Latest auth session activity (sign-in / refresh). */
  lastSignInAt: string | null;
  /** Latest meaningful field activity (loan issuance or repayment). */
  lastActiveAt: string | null;
  accountability: AgentAccountabilityContract;
  float: AgentDailyFloatContract | null;
  collectionsToday: number;
  collectionsLifetime: number;
  applicationsToday: number;
  applicationsLifetime: number;
  amountCollectedLifetime: number;
  amountDisbursedLifetime: number;
};

export type AgentDeviceContract = {
  id: string;
  deviceName: string;
  deviceType: string;
  platform: string | null;
  lastUsedAt: string;
  status: 'CURRENT' | 'ACTIVE';
  canRemove: boolean;
};

export type AgentAccessHistoryType =
  | 'ACCOUNT_CREATED'
  | 'FIRST_SIGN_IN'
  | 'ACCOUNT_SUSPENDED'
  | 'ACCOUNT_REACTIVATED'
  | 'PASSWORD_RESET'
  | 'DEVICES_SIGNED_OUT';

export type AgentAccessHistoryContract = {
  id: string;
  type: AgentAccessHistoryType;
  title: string;
  detail: string;
  occurredAt: string;
  actorName: string;
};

export type AgentAccountResponse = {
  devices: AgentDeviceContract[];
  accessHistory: AgentAccessHistoryContract[];
};

export type AgentActivityApplicationContract = {
  id: string;
  customerId: string | null;
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
  customerId: string;
  clientName: string;
  phone: string | null;
  amount: number;
  method: string;
  note: string | null;
  paidAt: string;
};

export type AgentOtherActivityType =
  | 'FLOAT_RECEIVED'
  | 'RECONCILIATION_COMPLETED'
  | 'EXPENSE_RECORDED'
  | 'EXPENSE_VOIDED'
  | 'ACCOUNT_SUSPENDED'
  | 'ACCOUNT_ACTIVATED';

export type AgentOtherActivityContract = {
  id: string;
  type: AgentOtherActivityType;
  title: string;
  detail: string;
  occurredAt: string;
};

export type AgentActivityResponse = {
  date: string;
  range: 'today' | 'week' | 'all';
  applications: AgentActivityApplicationContract[];
  collections: AgentActivityCollectionContract[];
  otherActivity: AgentOtherActivityContract[];
};
