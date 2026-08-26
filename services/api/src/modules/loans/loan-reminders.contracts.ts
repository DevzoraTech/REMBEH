export type LoanReminderStatusContract =
  | 'sent'
  | 'not_sent'
  | 'queued'
  | 'sending'
  | 'failed';

export type LoanReminderSummaryContract = {
  status: LoanReminderStatusContract;

  lastSentAt:
    | string
    | null;

  lastFailureReason:
    | string
    | null;

  canResend:
    boolean;

  activeBatchId:
    | string
    | null;
};

export type LoanReminderBatchContract = {
  id:
    string;

  branchId:
    string;

  filter:
    string;

  status:
    string;

  totalCount:
    number;

  sentCount:
    number;

  failedCount:
    number;

  skippedCount:
    number;

  createdAt:
    string;

  completedAt:
    | string
    | null;
};

export type LoanReminderEnqueueResponseContract = {
  batch:
    LoanReminderBatchContract;

  reminder:
    LoanReminderSummaryContract;
};