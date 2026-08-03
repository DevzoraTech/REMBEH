import { evaluatePahappaImmediateResponse, classifyProviderRejectionReason } from './pahappa-response';

describe('evaluatePahappaImmediateResponse', () => {
  it('accepts definite OK responses', () => {
    expect(
      evaluatePahappaImmediateResponse({
        httpOk: true,
        status: 'OK',
        providerMessageId: 'FU-123',
      }),
    ).toEqual({ outcome: 'accepted' });
  });

  it('rejects clear provider failures with classified reason', () => {
    expect(
      evaluatePahappaImmediateResponse({
        httpOk: true,
        status: 'ERROR',
        providerDetail: 'Invalid number',
      }),
    ).toEqual({ outcome: 'rejected', reason: 'invalid_recipient' });
    expect(
      evaluatePahappaImmediateResponse({
        httpOk: false,
        status: 'OK',
      }),
    ).toEqual({ outcome: 'rejected', reason: 'provider_rejected' });
  });

  it('marks empty status with HTTP OK as ambiguous', () => {
    expect(
      evaluatePahappaImmediateResponse({
        httpOk: true,
        status: '',
      }),
    ).toEqual({ outcome: 'ambiguous' });
  });
});

describe('classifyProviderRejectionReason', () => {
  it('maps known rejection classes', () => {
    expect(classifyProviderRejectionReason('Unauthorised sender ID')).toBe(
      'unauthorised_sender',
    );
    expect(classifyProviderRejectionReason('Insufficient balance')).toBe(
      'insufficient_provider_balance',
    );
    expect(classifyProviderRejectionReason('Destination blocked')).toBe(
      'blocked_destination',
    );
    expect(classifyProviderRejectionReason('Malformed request body')).toBe(
      'malformed_request',
    );
  });
});
