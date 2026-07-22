export type CustomerApiContract = {
  id: string;
  branchId: string;
  branchName: string | null;
  fullName: string;
  phone: string;
  nationalId: string | null;
  email: string | null;
  businessName: string | null;
  collateralType: string | null;
  city: string | null;
  loanCount: number;
  verifiedAt: string | null;
  createdAt: string;
};

export type CustomerLoanSummaryContract = {
  id: string;
  applicationId: string | null;
  status: string;
  currency: string;
  principal: number;
  balance: number;
  openingBalance: number | null;
  finesTotal: number;
  isFined: boolean;
  disbursedAt: string | null;
  paymentStartDate: string | null;
  createdAt: string;
  updatedAt: string;
  officerName: string | null;
  officerPublicId: string | null;
  loanTypeName: string | null;
  businessName: string | null;
  collateralType: string | null;
  city: string | null;
  repaymentsCount: number;
  paidAmount: number;
  lastPaymentAt: string | null;
};

export type CustomerDocumentContract = {
  id: string;
  applicationId: string;
  loanId: string | null;
  type: string;
  mimeType: string;
  byteSize: number;
  fileName: string | null;
  createdAt: string;
  businessName: string | null;
  collateralType: string | null;
  downloadUrl: string | null;
};

export type CustomerPaymentContract = {
  id: string;
  loanId: string;
  amount: number;
  method: string;
  paidAt: string;
  recordedByName: string;
  recordedByPublicId: string | null;
  note: string | null;
};

export type CustomerDetailContract = CustomerApiContract & {
  loans: CustomerLoanSummaryContract[];
  documents: CustomerDocumentContract[];
  recentPayments: CustomerPaymentContract[];
};

export type CustomerResponseContract = {
  customer: CustomerApiContract;
};

export type CustomerDetailResponseContract = {
  customer: CustomerDetailContract;
};

export type CustomerListResponseContract = {
  customers: CustomerApiContract[];
};
