export const BORROWER_LIST_EVENTS = {
  saved: 'borrower_list.saved',
  removed: 'borrower_list.removed',
} as const;

export type BorrowerListEventPayload = {
  entryId: string;
  type: string;
  nationalId: string;
  customerId: string | null;
  actorUserId: string;
};
