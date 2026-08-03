/**
 * GSM-7 / Unicode SMS segment math (ETSI TS 123 038 / common carrier rules).
 * Single-part: GSM-7 160, Unicode 70.
 * Multi-part: GSM-7 153, Unicode 67 per segment.
 */

const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';

const GSM7_EXTENDED = '^{}\\[~]|€';

export type SmsEncoding = 'GSM7' | 'UNICODE';

export type SmsSegmentInfo = {
  encoding: SmsEncoding;
  characterCount: number;
  segmentsRequired: number;
};

function gsm7CharUnits(char: string): number | null {
  if (GSM7_BASIC.includes(char)) return 1;
  if (GSM7_EXTENDED.includes(char)) return 2;
  return null;
}

export function analyzeSmsBody(body: string): SmsSegmentInfo {
  let gsmUnits = 0;
  let isGsm7 = true;

  for (const char of body) {
    const units = gsm7CharUnits(char);
    if (units == null) {
      isGsm7 = false;
      break;
    }
    gsmUnits += units;
  }

  if (isGsm7) {
    const characterCount = gsmUnits;
    if (characterCount === 0) {
      return { encoding: 'GSM7', characterCount: 0, segmentsRequired: 0 };
    }
    if (characterCount <= 160) {
      return { encoding: 'GSM7', characterCount, segmentsRequired: 1 };
    }
    return {
      encoding: 'GSM7',
      characterCount,
      segmentsRequired: Math.ceil(characterCount / 153),
    };
  }

  const characterCount = [...body].length;
  if (characterCount === 0) {
    return { encoding: 'UNICODE', characterCount: 0, segmentsRequired: 0 };
  }
  if (characterCount <= 70) {
    return { encoding: 'UNICODE', characterCount, segmentsRequired: 1 };
  }
  return {
    encoding: 'UNICODE',
    characterCount,
    segmentsRequired: Math.ceil(characterCount / 67),
  };
}

/** Normalize to digits-only Uganda MSISDN form `256…` (no +). */
export function normalizeUgPhoneTo256(value: string): string | null {
  const digits = value.trim().replace(/\D/g, '');
  if (!digits) return null;
  let normalized = digits;
  if (normalized.startsWith('00')) normalized = normalized.slice(2);
  if (normalized.startsWith('0') && normalized.length >= 9) {
    normalized = `256${normalized.slice(1)}`;
  }
  if (!normalized.startsWith('256') && normalized.length === 9) {
    normalized = `256${normalized}`;
  }
  if (!/^256\d{9}$/.test(normalized)) return null;
  return normalized;
}
