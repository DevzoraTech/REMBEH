export const LOAN_PRODUCT_PERMISSIONS = {
  manage: 'loan.product.manage',
  read: 'loan.read',
} as const;

export const LOAN_PRODUCT_PERMISSION_LIST = Object.values(
  LOAN_PRODUCT_PERMISSIONS,
);
