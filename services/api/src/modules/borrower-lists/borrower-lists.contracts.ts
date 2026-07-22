export type BorrowerListTypeContract = 'BLACKLISTED' | 'WATCHLIST';

export type BorrowerListEntryContract = {
  id: string;
  type: BorrowerListTypeContract;
  borrowerName: string | null;
  nationalId: string;
  phone: string | null;
  reason: string | null;
  customerId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BorrowerListResponseContract = {
  entry: BorrowerListEntryContract;
};

export type BorrowerListListResponseContract = {
  entries: BorrowerListEntryContract[];
};
