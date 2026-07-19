export type CustomerApiContract = {
  id: string;
  branchId: string;
  fullName: string;
  phone: string;
  nationalId: string | null;
  email: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
};

export type CustomerResponseContract = {
  customer: CustomerApiContract;
};

export type CustomerListResponseContract = {
  customers: CustomerApiContract[];
};
