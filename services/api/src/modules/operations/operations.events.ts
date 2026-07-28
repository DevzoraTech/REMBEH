export const OPERATIONS_EVENTS = {
  branchOpened: 'operation.branch_opened',
  branchFloatUpdated: 'operation.float_updated',
  branchClosingStarted: 'operation.closing_started',
  branchClosed: 'operation.branch_closed',
  branchApproved: 'operation.branch_approved',
} as const;

export type BranchOperationEventPayload = {
  operationId: string;
  tenantId: string;
  branchId: string;
  operationDate: string;
  status: string;
};
