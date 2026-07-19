export type VerifyNationalIdInput = {
  nationalId: string;
  country?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
};

export type VerifyNationalIdResult = {
  valid: boolean;
  provider: 'smile_id' | 'stub';
  jobId: string;
  verificationCode: string;
  matchedFirstName?: string | null;
  matchedLastName?: string | null;
  raw?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
};

export interface IdentityVerificationProvider {
  verifyNationalId(
    input: VerifyNationalIdInput,
  ): Promise<VerifyNationalIdResult>;
}

export const IDENTITY_VERIFICATION_PROVIDER = Symbol(
  'IDENTITY_VERIFICATION_PROVIDER',
);

/** Reserved for biometric KYC later — no UI wiring in this pass. */
export interface BiometricKycProvider {
  startBiometricSession(input: {
    userId: string;
    nationalId: string;
  }): Promise<{ sessionId: string; status: 'not_implemented' }>;
}
