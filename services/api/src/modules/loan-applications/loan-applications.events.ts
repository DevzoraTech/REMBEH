export const LOAN_APPLICATION_EVENTS = {
  submitted: 'loan_application.submitted',
  updated: 'loan_application.updated',
  mediaUploaded: 'loan_application.media_uploaded',
} as const;

export type LoanApplicationEventPayload = {
  applicationId: string;
  branchId: string;
  officerUserId: string;
  status: string;
  clientName: string;
  phone: string;
  amountRequested: number | null;
  interestRatePercent: number | null;
  registeredAt: string;
  synced: boolean;
};
