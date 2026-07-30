export const OPERATIONS_PERMISSIONS = {
  read: 'operation.read',
  open: 'operation.open',
  cashTopUp: 'operation.cash.topup',
  floatManage: 'operation.float.manage',
  floatReturn: 'operation.float.return',
  expenseCreate: 'operation.expense.create',
  expenseApprove: 'operation.expense.approve',
  close: 'operation.close',
  approve: 'operation.approve',
  reportReview: 'operation.report.review',
} as const;

export const OPERATIONS_PERMISSION_LIST = Object.values(OPERATIONS_PERMISSIONS);
