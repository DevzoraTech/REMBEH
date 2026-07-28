export type LoanListItemContract = {
  id: string;
  applicationId: string | null;
  customerId: string;
  borrowerName: string;
  phone: string;
  nationalId: string | null;
  loanTypeName: string | null;
  status: string;
  principal: number;
  balance: number;
  paidAmount: number;
  installmentAmount: number;
  currency: string;
  officerName: string | null;
  officerPublicId: string | null;
  branchId: string;
  paymentStartDate: string | null;
  durationDays: number | null;
  dueDate: string | null;
  createdAt: string;
  disbursedAt: string | null;
  updatedAt: string;
};

export type LoanListResponseContract = {
  loans: LoanListItemContract[];
};
