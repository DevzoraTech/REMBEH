export const REALTIME_EVENTS = {
  loanApplicationSubmitted: 'loan_application.submitted',
  loanApplicationUpdated: 'loan_application.updated',
  loanApplicationMediaUploaded: 'loan_application.media_uploaded',
  paymentMade: 'payment.made',
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
