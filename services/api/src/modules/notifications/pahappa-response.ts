export type PahappaAcceptanceInput = {
  httpOk: boolean;
  status: string;
  providerMessageId?: string | null;
  providerDetail?: string | null;
};

export type PahappaAcceptanceResult =
  | { outcome: 'accepted' }
  | { outcome: 'rejected'; reason: string }
  | { outcome: 'ambiguous' };

/**
 * Step 7 — classify immediate Pahappa/EgoSMS response.
 * Definite acceptance: HTTP OK + Status OK/SUCCESS.
 */
export function evaluatePahappaImmediateResponse(
  input: PahappaAcceptanceInput,
): PahappaAcceptanceResult {
  const status = (input.status || '').trim().toUpperCase();
  if (!status && input.httpOk) {
    return { outcome: 'ambiguous' };
  }
  if (input.httpOk && (status === 'OK' || status === 'SUCCESS')) {
    return { outcome: 'accepted' };
  }
  if (
    !input.httpOk ||
    status === 'ERROR' ||
    status === 'FAILED' ||
    status === 'FAIL' ||
    status === 'REJECTED'
  ) {
    return {
      outcome: 'rejected',
      reason: classifyProviderRejectionReason(input.providerDetail ?? status),
    };
  }
  return { outcome: 'ambiguous' };
}

/**
 * Step 7B — map definitive rejection details to stable failure reasons.
 * Examples: invalid recipient, unauthorised sender ID, malformed request,
 * insufficient provider balance, blocked destination.
 */
export function classifyProviderRejectionReason(detail: string): string {
  const text = detail.toLowerCase();
  if (
    text.includes('invalid') &&
    (text.includes('number') ||
      text.includes('recipient') ||
      text.includes('msisdn') ||
      text.includes('phone'))
  ) {
    return 'invalid_recipient';
  }
  if (
    text.includes('sender') &&
    (text.includes('unauthor') ||
      text.includes('not allowed') ||
      text.includes('unauthorized') ||
      text.includes('forbidden'))
  ) {
    return 'unauthorised_sender';
  }
  if (
    text.includes('malform') ||
    text.includes('bad request') ||
    text.includes('invalid request') ||
    text.includes('parse')
  ) {
    return 'malformed_request';
  }
  if (
    text.includes('balance') ||
    text.includes('insufficient credit') ||
    text.includes('no credit') ||
    text.includes('low credit')
  ) {
    return 'insufficient_provider_balance';
  }
  if (
    text.includes('block') ||
    text.includes('blacklist') ||
    text.includes('dnd') ||
    text.includes('barred') ||
    text.includes('unreachable')
  ) {
    return 'blocked_destination';
  }
  return 'provider_rejected';
}
