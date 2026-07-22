import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type {
  IdentityVerificationProvider,
  VerifyNationalIdInput,
  VerifyNationalIdResult,
} from './identity-verification.types';

@Injectable()
export class StubIdentityVerificationProvider implements IdentityVerificationProvider {
  private readonly logger = new Logger(StubIdentityVerificationProvider.name);

  async verifyNationalId(
    input: VerifyNationalIdInput,
  ): Promise<VerifyNationalIdResult> {
    this.logger.warn(
      'Using StubIdentityVerificationProvider (Smile ID keys missing or disabled).',
    );

    const nin = input.nationalId.trim().toUpperCase();

    // Deterministic invalid NINs for local negative-path testing.
    if (nin.startsWith('INVALID') || nin.length < 5) {
      return {
        valid: false,
        provider: 'stub',
        jobId: `stub-job-${randomBytes(4).toString('hex')}`,
        verificationCode: '',
        errorCode: 'NIN_NOT_FOUND',
        errorMessage: 'National ID was not found or is invalid.',
        raw: { stub: true, nationalId: nin },
      };
    }

    const verificationCode = createHash('sha256')
      .update(nin)
      .digest('hex')
      .slice(0, 6)
      .toUpperCase();

    return {
      valid: true,
      provider: 'stub',
      jobId: `stub-job-${randomBytes(6).toString('hex')}`,
      verificationCode,
      matchedFirstName: input.firstName?.trim() || null,
      matchedLastName: input.lastName?.trim() || null,
      raw: {
        stub: true,
        nationalId: nin,
        country: input.country ?? 'UG',
      },
    };
  }
}
