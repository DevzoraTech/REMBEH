export const CUSTOMER_EVENTS = {
  registered: 'customer.registered',
  updated: 'customer.updated',
  verified: 'customer.verified',
} as const;

export type CustomerRegisteredEventPayload = {
  customerId: string;
  branchId: string;
  registeredByUserId: string;
  fullName: string;
  phone: string;
};
