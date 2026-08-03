export type SmsWalletContract = {
  branchId: string;
  branchName: string;
  creditsRemaining: number;
  canSendSms: boolean;
  topUpPresets: Array<{
    amountUgx: number;
    currency: string;
    credits: number;
  }>;
};

/** Header / account balance (branch for managers, sum for owners). */
export type SmsBalanceContract = {
  creditsRemaining: number;
  canSendSms: boolean;
  scope: 'branch' | 'account';
  branchId: string | null;
  branchName: string | null;
};

export type SmsTopUpCheckoutContract = {
  redirectUrl: string;
  merchantReference: string;
  orderTrackingId: string | null;
  amountUgx: number;
  credits: number;
};
