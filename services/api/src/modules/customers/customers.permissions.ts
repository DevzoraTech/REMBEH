export const CUSTOMER_PERMISSIONS = {
  create: 'customer.create',
  read: 'customer.read',
  update: 'customer.update',
  verify: 'customer.verify',
} as const;

export const CUSTOMER_PERMISSION_LIST = Object.values(CUSTOMER_PERMISSIONS);
