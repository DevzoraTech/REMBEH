import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthContextModule } from '../../common/auth/auth-context.module';
import { StubBiometricKycProvider } from './biometric-kyc.provider';
import { IdentityVerificationController } from './identity-verification.controller';
import { IdentityVerificationService } from './identity-verification.service';
import { IDENTITY_VERIFICATION_PROVIDER } from './identity-verification.types';
import { SmileIdProvider } from './smile-id.provider';
import { StubIdentityVerificationProvider } from './stub-identity-verification.provider';

@Module({
  imports: [AuthContextModule],
  controllers: [IdentityVerificationController],
  providers: [
    SmileIdProvider,
    StubIdentityVerificationProvider,
    StubBiometricKycProvider,
    IdentityVerificationService,
    {
      provide: IDENTITY_VERIFICATION_PROVIDER,
      inject: [
        ConfigService,
        SmileIdProvider,
        StubIdentityVerificationProvider,
      ],
      useFactory: (
        config: ConfigService,
        smile: SmileIdProvider,
        stub: StubIdentityVerificationProvider,
      ) => {
        const enabled =
          (config.get<string>('SMILE_ID_ENABLED') ?? 'false').toLowerCase() ===
          'true';
        const partnerId = config.get<string>('SMILE_ID_PARTNER_ID')?.trim();
        const apiKey = config.get<string>('SMILE_ID_API_KEY')?.trim();

        if (enabled && partnerId && apiKey) {
          return smile;
        }

        return stub;
      },
    },
  ],
  exports: [IdentityVerificationService, StubBiometricKycProvider],
})
export class IdentityVerificationModule {}
