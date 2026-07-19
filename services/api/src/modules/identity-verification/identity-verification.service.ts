import { Inject, Injectable } from '@nestjs/common';
import type {
  IdentityVerificationProvider,
  VerifyNationalIdInput,
  VerifyNationalIdResult,
} from './identity-verification.types';
import { IDENTITY_VERIFICATION_PROVIDER } from './identity-verification.types';

@Injectable()
export class IdentityVerificationService {
  constructor(
    @Inject(IDENTITY_VERIFICATION_PROVIDER)
    private readonly provider: IdentityVerificationProvider,
  ) {}

  verifyNationalId(
    input: VerifyNationalIdInput,
  ): Promise<VerifyNationalIdResult> {
    return this.provider.verifyNationalId(input);
  }
}
