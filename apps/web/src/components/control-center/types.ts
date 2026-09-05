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

export type ControlCenterFeatureAccess = {
  enabled: boolean;
  source: "ORGANIZATION" | "BRANCH" | null;
  hasOwnSetting: boolean;
  ownEnabled: boolean | null;
  reason: string | null;
  organizationEnabled: boolean | null;
  updatedAt: string | null;
  updatedBy: {
    name: string;
    email: string;
  } | null;
};

export type ControlCenterTenantTrial = {
  durationDays: number;
  isCustom: boolean;
  defaultDays: number;
  startsAt: string;
  endsAt: string;
};

export type ControlCenterBranchUsage = {
  branch: { id: string; name: string; address: string };
  today: {
    collected: number;
    repaymentCount: number;
    loansIssued: number;
    principalIssued: number;
    newBorrowers: number;
    operationStatus: string | null;
    reportStatus: string | null;
  };
  week: {
    days: Array<{
      date: string;
      collected: number;
      repaymentCount: number;
      loansIssued: number;
      principalIssued: number;
      operationOpened: boolean;
      operationClosed: boolean;
      operationStatus: string | null;
      reportSubmitted: boolean;
      reportStatus: string | null;
    }>;
    totals: {
      collected: number;
      repaymentCount: number;
      loansIssued: number;
      activeDays: number;
      closedDays: number;
    };
    usageLevel: "healthy" | "light" | "idle" | "inactive";
    usageReason: string;
  };
  recentActivity: Array<{
    id: string;
    type: "repayment" | "loan" | "report";
    title: string;
    detail: string;
    amount: number | null;
    at: string;
  }>;
  lastUsedAt: string | null;
  lastUsedBy: string | null;
  lastUsedDevice: string | null;
  lastUsedPlatform: string | null;
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

export type ControlCenterReportsOverview = {
  period: {
    from: string;
    to: string;
    previousFrom: string;
    previousTo: string;
  };

  totals: {
    organizations: number;
    branches: number;
    users: number;
    borrowers: number;
    loans: number;
    repaymentCount: number;
    repaymentsCollected: number;
    subscriptionPayments: number;
    subscriptionRevenue: number;
  };

  periodMetrics: {
    newOrganizations: number;
    newBranches: number;
    newBorrowers: number;
    disbursedLoans: number;
    principalDisbursed: number;
    repaymentCount: number;
    repaymentsCollected: number;
    subscriptionPayments: number;
    subscriptionRevenue: number;
  };

  previousPeriod: {
    newOrganizations: number;
    newBranches: number;
    newBorrowers: number;
    disbursedLoans: number;
    principalDisbursed: number;
    repaymentCount: number;
    repaymentsCollected: number;
    subscriptionPayments: number;
    subscriptionRevenue: number;
  };

  trends: Array<{
    date: string;
    borrowers: number;
    loans: number;
    principalDisbursed: number;
    repaymentCount: number;
    repaymentsCollected: number;
    subscriptionPayments: number;
    subscriptionRevenue: number;
  }>;

  organizations: Array<{
    tenantId: string;
    organizationName: string;
    newBorrowers: number;
    disbursedLoans: number;
    principalDisbursed: number;
    repaymentCount: number;
    repaymentsCollected: number;
    subscriptionPayments: number;
    subscriptionRevenue: number;
  }>;
};

export type ControlCenterAuditCategory =
  "GENERAL" | "SECURITY" | "COMMERCIAL" | "COMMUNICATIONS";

export type ControlCenterAuditLog = {
  id: string;

  action: string;

  category: ControlCenterAuditCategory;

  entityType: string;

  entityId: string | null;

  oldValue: unknown | null;

  newValue: unknown | null;

  admin: {
    id: string;
    name: string;
    email: string;
  } | null;

  createdAt: string;
};

export type ControlCenterAuditResponse = {
  stats: {
    total: number;
    last24Hours: number;
    security: number;
    commercial: number;
    communications: number;
  };

  filteredStats: {
    total: number;
    security: number;
    commercial: number;
    communications: number;
  };

  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };

  filters: {
    admins: Array<{
      id: string;
      name: string;
      email: string;
    }>;

    actions: string[];

    entityTypes: string[];
  };

  logs: ControlCenterAuditLog[];
};

export type ControlCenterSettingsAdmin = {
  email: string;
  displayName: string;
  adminId: string | null;
  status: string;
  setupComplete: boolean;
  lastLoginAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ControlCenterSettingsTemplate = {
  id: string;
  code: string;
  name: string;
  channel: "EMAIL" | "SMS";
  subject: string | null;
  body: string;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ControlCenterSettingsPlan = {
  id: string;
  code: string;
  name: string;
  amount: number;
  currency: string;
  interval: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ControlCenterOperatorSmsContact = {
  id: string;
  name: string;
  phone: string;
  phoneDisplay: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ControlCenterSettings = {
  administrators: ControlCenterSettingsAdmin[];

  accessConfiguration: {
    source: "ENVIRONMENT" | "DEFAULT";
    allowedCount: number;
    jwtSecretConfigured: boolean;
  };

  templates: ControlCenterSettingsTemplate[];

  plans: ControlCenterSettingsPlan[];

  operatorSmsContacts?: ControlCenterOperatorSmsContact[];

  billing: {
    providers: Array<{
      provider: "MTN_MOMO" | "AIRTEL_MONEY";
      label: string;
      merchantCode: string | null;
      accountName: string | null;
      configured: boolean;
    }>;
  };
};

export type ControlCenterSmsEconomics = {
  providerCostPerSms: number;
  soldUnits: number;
  creditedPurchases: number;
  revenueUgx: number;
  providerCostUgx: number;
  reserveUgx: number;
  sellRate: number;
  walletAvailable: number;
  walletReserved: number;
  lifetimeUsed: number;
  lifetimePurchased: number;
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
  tenantActivity?: Array<{
    id: string;
    action: string;
    organizationName: string;
    actorName: string;
    createdAt: string;
  }>;
};

export type ControlCenterPaymentStatus =
  "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED" | "REVERSED";

export type ControlCenterPaymentMethod = "MTN" | "AIRTEL" | "OTHER" | "UNKNOWN";

export type ControlCenterPaymentRecord = {
  id: string;
  kind: "subscription" | "sms";
  tenantId: string;
  branchId: string;
  planId: string | null;
  organizationName: string;
  branchName: string;
  planCode: string | null;
  planName: string | null;
  interval: string | null;
  smsUnits: number | null;
  bundleId: string | null;
  amount: number;
  expectedAmount: number | null;
  currency: string;
  status: ControlCenterPaymentStatus;
  createdAt: string;
  paidAt: string | null;
  paymentMethod: ControlCenterPaymentMethod;
  merchantReference: string | null;
  merchantCode: string | null;
  accountName: string | null;
  transactionId: string | null;
  verificationCode: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  failureReason: string | null;
  failedAt: string | null;
  canReview: boolean;
};

export type ControlCenterPaymentsResponse = {
  stats: {
    total: number;
    pending: number;
    completed: number;
    failed: number;
    completedRevenue: number;
    completedPayments: number;
  };
  smsEconomics?: ControlCenterSmsEconomics;
  payments: ControlCenterPaymentRecord[];
};

export type ControlCenterSubscriptionLifecycleStatus =
  "ACTIVE" | "EXPIRING" | "EXPIRED" | "LOCKED" | "NO_SUBSCRIPTION";

export type ControlCenterSubscriptionRecord = {
  id: string;
  clientId: string;
  branchId: string;
  organizationName: string;
  organizationStatus: string;
  branchName: string;
  branchAddress: string;
  branchStatus: string;
  planCode: string | null;
  planName: string | null;
  subscriptionStatus: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  graceEndsAt: string | null;
  lockedAt: string | null;
  users: number;
  borrowers: number;
  loans: number;
  lifecycleStatus: ControlCenterSubscriptionLifecycleStatus;
  daysRemaining: number | null;
  currency: string;
  effectiveAmount: number | null;
  pricingSource:
    "DEFAULT_PLAN" | "ORGANIZATION_OVERRIDE" | "BRANCH_OVERRIDE" | null;
  priceOverrideId: string | null;
  lastUsedAt: string | null;
  subscriptionRevenue: number;
  subscriptionPayments: number;
  latestPayment: ControlCenterPaymentRecord | null;
};

export type ControlCenterSubscriptionsResponse = {
  stats: {
    total: number;
    active: number;
    expiring: number;
    expired: number;
    locked: number;
    noSubscription: number;
    attention: number;
  };
  paymentStats: {
    total: number;
    pending: number;
    pendingSubscriptions: number;
    pendingSms: number;
    completed: number;
    failed: number;
    completedRevenue: number;
    completedPayments: number;
    completedSubscriptionRevenue: number;
    completedSmsRevenue: number;
  };
  plans: ControlCenterPlan[];
  smsBundles: ControlCenterSmsBundle[];
  smsEconomics?: ControlCenterSmsEconomics;
  payments: ControlCenterPaymentRecord[];
  subscriptions: ControlCenterSubscriptionRecord[];
};

export type ControlCenterSmsBundle = {
  id: string;
  code: string;
  name: string;
  priceUgx: number;
  smsUnits: number;
  currency: "UGX";
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  version: number;
  activeFrom: string;
  activeTo: string | null;
  effectiveRate: number;
  providerCostPerSms?: number;
  reservePerSms?: number;
  reserveUgx?: number;
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
    dataCorrectionAccess: ControlCenterFeatureAccess;
    trial?: ControlCenterTenantTrial;
  };
  branches: ControlCenterBranch[];
  subscriptions: Array<{
    id: string;
    branchId: string;
    branchName: string;
    planCode: string | null;
    planName: string | null;
    amount: number;
    currency: string;
    status: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    graceEndsAt: string | null;
    lockedAt: string | null;
    lastReminderAt: string | null;
  }>;
  payments: Array<{
    id: string;
    branch: { id: string; name: string };
    planCode: string;
    planName: string;
    amount: number;
    currency: string;
    status: string;
    merchantReference: string;
    orderTrackingId: string | null;
    paidAt: string | null;
    createdAt: string;
  }>;
  users: Array<{
    id: string;
    name: string;
    email: string;
    phone: string | null;
    publicId: string | null;
    status: string;
    branch: { id: string; name: string } | null;
    roles: string[];
    lastUsedAt: string | null;
    lastUsedDevice: string | null;
    lastUsedPlatform: string | null;
    sessionActive: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
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
  dataCorrectionAccess: ControlCenterFeatureAccess | null;
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

export type ControlCenterMarketingCampaignStatus =
  "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";

export type ControlCenterMarketingCampaignAudience =
  | "ALL_USERS"
  | "TENANT_USERS"
  | "BRANCH_USERS"
  | "TENANT_OWNERS"
  | "ROLE_USERS"
  | "SELECTED_USERS";

export type ControlCenterMarketingCampaignMediaType =
  "NONE" | "IMAGE" | "VIDEO";

export type ControlCenterMarketingCampaign = {
  id: string;
  title: string;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  mediaUrl: string | null;
  mediaStorageKey: string | null;
  mediaType: ControlCenterMarketingCampaignMediaType;
  placement: "MOBILE_HEADER";
  audience: ControlCenterMarketingCampaignAudience;
  status: ControlCenterMarketingCampaignStatus;
  tenantId: string | null;
  branchId: string | null;
  tenantName: string | null;
  branchName: string | null;
  roleNames: string[];
  userIds: string[];
  priority: number;
  startsAt: string;
  endsAt: string | null;
  createdBy: {
    id: string;
    name: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type ControlCenterMarketingCampaignsResponse = {
  stats: {
    total: number;
    active: number;
    draft: number;
    paused: number;
    archived: number;
  };
  campaigns: ControlCenterMarketingCampaign[];
};
