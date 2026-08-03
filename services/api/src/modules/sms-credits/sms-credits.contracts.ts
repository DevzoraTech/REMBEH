export type SmsBundleContract = {
  id: string;
  code: string;
  name: string;
  priceUgx: number;
  smsUnits: number;
  currency: 'UGX';
  version: number;
};

export type SmsWalletContract = {
  branchId: string;
  branchName: string;
  availableUnits: number;
  reservedUnits: number;
  canSendSms: boolean;
  /** @deprecated Prefer availableUnits. Kept for older clients. */
  creditsRemaining: number;
};

/** Header / account balance (branch for managers, sum for owners). */
export type SmsBalanceContract = {
  availableUnits: number;
  reservedUnits: number;
  canSendSms: boolean;
  scope: 'branch' | 'account';
  branchId: string | null;
  branchName: string | null;
  /** @deprecated Prefer availableUnits. */
  creditsRemaining: number;
};

export type SmsPurchaseCheckoutContract = {
  redirectUrl: string;
  purchaseId: string;
  merchantReference: string;
  orderTrackingId: string | null;
  bundleId: string;
  bundleName: string;
  amountUgx: number;
  smsUnits: number;
  currency: 'UGX';
  status: string;
};

export type SmsLedgerEntryContract = {
  id: string;
  entryType: string;
  direction: string;
  units: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  referenceType: string;
  referenceId: string;
  createdAt: string;
};

export type SmsDispatchResult = {
  sent: boolean;
  reason?: string;
  messageId?: string;
  segmentsRequired?: number;
  /** Provider acceptance is not handset delivery. */
  deliveryStatus?: string;
};
