export const LOAN_APPLICATION_PERMISSIONS = {
  create: 'loan.create',
  read: 'loan.read',
  update: 'loan.update',
} as const;

export const LOAN_APPLICATION_PERMISSION_LIST = Object.values(
  LOAN_APPLICATION_PERMISSIONS,
);
