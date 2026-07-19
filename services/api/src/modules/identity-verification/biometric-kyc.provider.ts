import { Injectable } from '@nestjs/common';
import type { BiometricKycProvider } from './identity-verification.types';

/** Stub reserved for Smile biometric KYC — not wired to UI yet. */
@Injectable()
export class StubBiometricKycProvider implements BiometricKycProvider {
  async startBiometricSession(input: {
    userId: string;
    nationalId: string;
  }): Promise<{ sessionId: string; status: 'not_implemented' }> {
    return {
      sessionId: `bio-stub-${input.userId.slice(0, 8)}-${input.nationalId.slice(0, 4)}`,
      status: 'not_implemented',
    };
  }
}
