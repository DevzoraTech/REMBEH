import { LOAN_APPLICATION_PERMISSIONS } from '../loan-applications/loan-applications.permissions';

export const LOAN_PERMISSIONS = {
  create: LOAN_APPLICATION_PERMISSIONS.create,
  read: LOAN_APPLICATION_PERMISSIONS.read,
  update: LOAN_APPLICATION_PERMISSIONS.update,
} as const;
