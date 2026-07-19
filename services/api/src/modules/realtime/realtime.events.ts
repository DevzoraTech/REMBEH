export const REALTIME_EVENTS = {
  loanApplicationSubmitted: 'loan_application.submitted',
  loanApplicationUpdated: 'loan_application.updated',
  loanApplicationMediaUploaded: 'loan_application.media_uploaded',
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
