export type ControlCenterClient = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  ownerName: string | null;
  branchCount: number;
  activeBranchCount: number;
  userCount: number;
  customerCount: number;
  loanCount: number;
  pricingType: "CUSTOM" | "DEFAULT";
  status: string;
  createdAt: string;
};

export type ControlCenterClientsResponse = {
  stats: {
    totalClients: number;
    customPricing: number;
    defaultPricing: number;
    activeClients: number;
  };
  clients: ControlCenterClient[];
};

export type ControlCenterDashboard = {
  stats: Record<string, number>;
  recentPayments: Array<{
    id: string;
    organizationName: string;
    branchName: string;
    amount: number;
    currency: string;
    status: string;
    planCode: string;
    createdAt: string;
    paidAt: string | null;
  }>;
  recentActivity: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    adminName: string;
    createdAt: string;
  }>;
};

export type ControlCenterClientDetail = {
  client: {
    id: string;
    name: string;
    registrationNumber: string | null;
    country: string;
    currency: string;
    status: string;
    createdAt: string;
    owner: {
      id: string;
      name: string;
      email: string;
      phone: string | null;
    } | null;
    summary: {
      totalBranches: number;
      activeBranches: number;
      suspendedBranches: number;
      totalUsers: number;
    };
  };
  branches: ControlCenterBranch[];
  recentActivity: Array<{
    id: string;
    action: string;
    entityType: string;
    actorName: string;
    createdAt: string;
  }>;
};

export type ControlCenterBranch = {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  status: string;
  planCode: string | null;
  currentPeriodEnd: string | null;
  users: number;
  borrowers: number;
  loans: number;
  repaymentsCollected: number;
  repaymentCount: number;
  subscriptionRevenue: number;
  subscriptionPayments: number;
  lastUsedAt: string | null;
};

export type ControlCenterPricing = {
  plans: ControlCenterPlan[];
  branches: Array<{ id: string; name: string; address: string }>;
  organization: ControlCenterPriceRow[];
  branchOverrides: Array<{
    branch: { id: string; name: string };
    prices: ControlCenterPriceRow[];
  }>;
};

export type ControlCenterPlan = {
  id: string;
  code: string;
  name: string;
  amount: number;
  currency: string;
  interval: string;
};

export type ControlCenterPriceRow = {
  plan: ControlCenterPlan;
  defaultAmount: number;
  inheritedAmount: number | null;
  effectiveAmount: number;
  override: {
    id: string;
    amount: number;
    currency: string;
    reason: string;
    effectiveFrom: string;
    effectiveUntil: string | null;
    changedBy: string;
    status: "ACTIVE" | "SCHEDULED" | "EXPIRED";
  } | null;
};

export type ControlCenterPricingHistory = {
  history: Array<{
    id: string;
    scope: "ORGANIZATION" | "BRANCH";
    branch: { id: string; name: string } | null;
    planCode: string;
    planName: string;
    interval: string;
    oldAmount: number;
    newAmount: number;
    currency: string;
    effectiveFrom: string;
    effectiveUntil: string | null;
    revokedAt: string | null;
    reason: string;
    changedBy: string;
    createdAt: string;
  }>;
};

export type ControlCenterUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  publicId: string | null;
  status: string;
  tenant: { id: string; name: string; status: string };
  branch: { id: string; name: string } | null;
  roles: string[];
  lastUsedAt: string | null;
  lastUsedDevice: string | null;
  lastUsedPlatform: string | null;
  sessionActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ControlCenterTemplate = {
  id: string;
  code: string;
  name: string;
  channel: "EMAIL" | "SMS";
  subject: string | null;
  body: string;
};
