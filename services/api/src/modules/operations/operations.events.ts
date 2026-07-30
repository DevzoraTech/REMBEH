export const OPERATIONS_EVENTS = {
  branchOpened: 'operation.branch_opened',
  cashTopUpRecorded: 'operation.cash_topup_recorded',
  branchFloatUpdated: 'operation.float_updated',
  agentFloatReturned: 'operation.float_returned',
  expenseRecorded: 'operation.expense_recorded',
  expenseApproved: 'operation.expense_approved',
  branchClosingStarted: 'operation.closing_started',
  branchClosed: 'operation.branch_closed',
  branchApproved: 'operation.branch_approved',
  reportGenerated: 'operation.report_generated',
  reportManagerReviewed: 'operation.report_manager_reviewed',
  reportOwnerApproved: 'operation.report_owner_approved',
} as const;

export type BranchOperationEventPayload = {
  operationId: string;
  tenantId: string;
  branchId: string;
  operationDate: string;
  status: string;
};
