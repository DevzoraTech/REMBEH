import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes } from 'node:crypto';
import type {
  IdentityVerificationProvider,
  VerifyNationalIdInput,
  VerifyNationalIdResult,
} from './identity-verification.types';

@Injectable()
export class SmileIdProvider implements IdentityVerificationProvider {
  private readonly logger = new Logger(SmileIdProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async verifyNationalId(
    input: VerifyNationalIdInput,
  ): Promise<VerifyNationalIdResult> {
    const partnerId = this.configService.get<string>('SMILE_ID_PARTNER_ID');
    const apiKey = this.configService.get<string>('SMILE_ID_API_KEY');
    const baseUrl =
      this.configService.get<string>('SMILE_ID_BASE_URL')?.replace(/\/$/, '') ||
      'https://api.smileidentity.com/v1';
    const callbackUrl = this.configService.get<string>('SMILE_ID_CALLBACK_URL');

    if (!partnerId || !apiKey) {
      throw new Error('Smile ID credentials are not configured.');
    }

    const timestamp = new Date().toISOString();
    const signature = createHmac('sha256', apiKey)
      .update(timestamp)
      .update(partnerId)
      .update('sid_request')
      .digest('base64');

    const body = {
      partner_id: partnerId,
      signature,
      timestamp,
      country: input.country ?? 'UG',
      id_type: 'NATIONAL_ID',
      id_number: input.nationalId.trim(),
      first_name: input.firstName?.trim() || undefined,
      last_name: input.lastName?.trim() || undefined,
      phone_number: input.phoneNumber?.trim() || undefined,
      dob: input.dob?.trim() || undefined,
      gender: input.gender || undefined,
      partner_params: {
        job_id: `nin-${randomBytes(8).toString('hex')}`,
        user_id: input.nationalId.trim(),
        job_type: 5,
      },
      ...(callbackUrl ? { callback_url: callbackUrl } : {}),
    };

    const response = await fetch(`${baseUrl}/id_verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const raw = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (!response.ok) {
      this.logger.error(
        `Smile ID verify failed status=${response.status} body=${JSON.stringify(raw)}`,
      );
      return {
        valid: false,
        provider: 'smile_id',
        jobId: String(raw.smile_job_id ?? raw.JobID ?? body.partner_params.job_id),
        verificationCode: '',
        errorCode: 'SMILE_HTTP_ERROR',
        errorMessage:
          typeof raw.error === 'string'
            ? raw.error
            : 'Smile ID verification request failed.',
        raw,
      };
    }

    const resultCode = String(raw.ResultCode ?? raw.result_code ?? '');
    const valid =
      resultCode === '1012' ||
      resultCode === '1020' ||
      String(raw.ResultText ?? '')
        .toLowerCase()
        .includes('exact match') ||
      Boolean(raw.success);

    return {
      valid,
      provider: 'smile_id',
      jobId: String(raw.smile_job_id ?? raw.JobID ?? body.partner_params.job_id),
      verificationCode: String(
        raw.Signature ?? (resultCode || 'VERIFIED'),
      ).slice(0, 12),
      matchedFirstName:
        typeof raw.FirstName === 'string'
          ? raw.FirstName
          : (input.firstName ?? null),
      matchedLastName:
        typeof raw.LastName === 'string'
          ? raw.LastName
          : (input.lastName ?? null),
      errorCode: valid ? undefined : resultCode || 'NIN_NOT_FOUND',
      errorMessage: valid
        ? undefined
        : String(raw.ResultText ?? 'National ID verification failed.'),
      raw,
    };
  }
}
