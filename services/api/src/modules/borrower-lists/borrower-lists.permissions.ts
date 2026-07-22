import { CUSTOMER_PERMISSIONS } from '../customers/customers.permissions';

export const BORROWER_LIST_PERMISSIONS = {
  read: CUSTOMER_PERMISSIONS.read,
  manage: CUSTOMER_PERMISSIONS.update,
} as const;
