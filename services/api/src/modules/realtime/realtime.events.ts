export const REALTIME_EVENTS = {
  loanApplicationSubmitted: 'loan_application.submitted',
  loanApplicationUpdated: 'loan_application.updated',
  loanApplicationMediaUploaded: 'loan_application.media_uploaded',
  paymentMade: 'payment.made',
  subscriptionPaymentUpdated: 'subscription_payment.updated',
  loanFined: 'loan.fined',
  shortageUpdated: 'shortage.updated',
} as const;

export type LoanApplicationRealtimePayload = {
  applicationId: string;
  tenantId: string;
  branchId: string;
  status: string;
  clientName: string;
  phone: string;
  amountRequested: number | null;
  interestRatePercent: number | null;
  registeredAt: string;
  synced: boolean;
  officerUserId: string;
};

export type PaymentRealtimePayload = {
  repaymentId: string;
  loanId: string;
  customerId: string;
  tenantId: string;
  branchId: string;
  clientName: string;
  phone: string;
  amount: number;
  amountPaid: number;
  loanAmount: number;
  outstanding: number;
  recordedAt: string;
  method?: string;
  note?: string | null;
  synced: boolean;
  recordedByUserId: string;
  recordedByName?: string;
  agentPhotoUrl?: string | null;
};

export type SubscriptionPaymentRealtimePayload = {
  paymentId: string;
  tenantId: string;
  branchId: string;
  status: string;
  payment: {
    id: string;
    date: string;
    branchId: string;
    branchName: string;
    kind: 'subscription' | 'sms';
    transaction: string;
    periodLabel: string | null;
    amount: number;
    currency: string;
    planCode?: string | null;
    planDurationMonths?: number | null;
    activeUntil?: string | null;
    transactionId?: string | null;
    verifiedAt?: string | null;
    verifiedByName?: string | null;
    failureReason?: string | null;
    credits: number | null;
    paymentMethod: string;
    status: string;
    receipt: string | null;
    canRetry: boolean;
    canCancel?: boolean;
    bundleId?: string | null;
  };
};
