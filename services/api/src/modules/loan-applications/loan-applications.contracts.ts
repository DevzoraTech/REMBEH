export type LoanApplicationMediaContract = {
  id: string;
  type: string;
  storageKey: string;
  mimeType: string;
  byteSize: number;
  fileName: string | null;
  createdAt: string;
  /** Presigned GET URL for manager/agent preview (short-lived). */
  downloadUrl?: string | null;
};

export type LoanApplicationSignatureContract = {
  id: string;
  signerRole: string;
  version: number;
  locked: boolean;
  signerName: string;
  signedAt: string;
  signatureStorageKey: string;
  strokesStorageKey: string;
  metadataStorageKey: string;
  pngContentHash: string;
  strokesContentHash: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  /** Presigned GET URL for the signature PNG preview. */
  signatureDownloadUrl?: string | null;
};

export type LoanApplicationGuarantorContract = {
  fullName: string | null;
  phone: string | null;
};

export type LoanApplicationPricingContract = {
  principalAmount: number;
  interestRatePercent: number;
  durationDays: number;
  processingFee: number;
  interestAmount: number;
  totalRepayable: number;
};

export type LoanApplicationContract = {
  id: string;
  branchId: string;
  officerUserId: string;
  /** Registering field agent display name. */
  officerName: string | null;
  officerPublicId: string | null;
  /** Presigned GET for the registering agent's profile selfie. */
  agentPhotoUrl: string | null;
  agentPhotoStorageKey: string | null;
  status: string;
  surname: string | null;
  givenNames: string | null;
  phone: string | null;
  nationalId: string | null;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  /** YYYY-MM-DD when set. */
  dateOfBirth: string | null;
  district: string | null;
  subCounty: string | null;
  parish: string | null;
  village: string | null;
  principalAmount: number | null;
  interestRatePercent: number | null;
  durationDays: number | null;
  processingFee: number | null;
  loanProductTemplateId: string | null;
  templateName: string | null;
  interestType: 'FLAT' | null;
  termValue: number | null;
  termUnit: 'DAYS' | 'MONTHS' | 'YEARS' | null;
  repaymentFrequency: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | null;
  processingFeePercent: number | null;
  penaltyRatePercent: number | null;
  finePeriodDays: number | null;
  loanPurpose: string | null;
  collateralType: string | null;
  verificationCode: string | null;
  verifiedAt: string | null;
  termsConfirmedAt: string | null;
  /** Calendar day repayments start (set on submit from manager policy). */
  paymentStartDate: string | null;
  submittedAt: string | null;
  syncedAt: string | null;
  createdAt: string;
  updatedAt: string;
  clientName: string;
  synced: boolean;
  guarantor: LoanApplicationGuarantorContract | null;
  media: LoanApplicationMediaContract[];
  signatures: LoanApplicationSignatureContract[];
  signedAgreementKey: string | null;
  signedAgreementHash: string | null;
  signedAgreementVersion: number | null;
  signedAgreementDownloadUrl?: string | null;
  pricing: LoanApplicationPricingContract | null;
};

export type LoanApplicationListItemContract = {
  id: string;
  clientName: string;
  phone: string;
  amountRequested: number;
  interestRatePercent: number;
  registeredAt: string;
  synced: boolean;
  status: string;
  branchId: string;
};

export type LoanApplicationResponseContract = {
  application: LoanApplicationContract;
};

export type LoanApplicationListResponseContract = {
  applications: LoanApplicationListItemContract[];
};

export type MediaPresignResponseContract = {
  uploadUrl: string;
  storageKey: string;
  expiresInSeconds: number;
  mediaType: string;
};

export type SignaturePresignPartContract = {
  uploadUrl: string;
  storageKey: string;
  mimeType: string;
};

export type SignaturePresignResponseContract = {
  assetId: string;
  signerRole: string;
  version: number;
  expiresInSeconds: number;
  signature: SignaturePresignPartContract;
  strokes: SignaturePresignPartContract;
  metadata: SignaturePresignPartContract;
};
