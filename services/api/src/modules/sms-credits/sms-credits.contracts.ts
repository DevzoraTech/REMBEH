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

export type SmsTopUpCheckoutContract = {
  redirectUrl: string;
  merchantReference: string;
  orderTrackingId: string | null;
  amountUgx: number;
  credits: number;
};
