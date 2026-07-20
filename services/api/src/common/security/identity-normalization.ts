export function normalizeEmailAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeInternationalPhoneNumber(value: string): string {
  return value.trim().replace(/[\s()-]/g, '');
}

export function isInternationalPhoneNumber(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

/** True when the query is mostly digits (phone / NIN-like), not a person name. */
export function looksLikePhoneQuery(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7) return false;
  const compact = trimmed.replace(/[\s()+-]/g, '');
  return digits.length / Math.max(compact.length, 1) >= 0.7;
}

/**
 * Expand a phone-like query into Uganda-local variants so
 * `07…`, `7…`, `256…`, and `+256…` all match stored E.164 numbers.
 *
 * Leading `0` is always treated as a trunk prefix (even for partial queries),
 * so typing `0700…` can still `contains`-match `+256700…`.
 */
export function phoneSearchVariants(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const noSep = trimmed.replace(/[\s()-]/g, '');
  const digits = noSep.replace(/\D/g, '');
  const variants = new Set<string>();

  const add = (value: string | undefined) => {
    if (value && value.length >= 3) variants.add(value);
  };

  const addUgandaFamily = (national: string) => {
    if (!national) return;
    add(national);
    add(`0${national}`);
    add(`256${national}`);
    add(`+256${national}`);
  };

  add(noSep);
  add(digits);

  if (digits.startsWith('0') && digits.length >= 2) {
    // Local trunk: strip leading 0 even for short/partial queries.
    addUgandaFamily(digits.slice(1));
  } else if (digits.startsWith('256') && digits.length >= 4) {
    addUgandaFamily(digits.slice(3));
    add(`+${digits}`);
  } else if (digits.length >= 7 && digits.length <= 10) {
    // National digits without trunk/country code (e.g. 700123456).
    addUgandaFamily(digits);
  }

  if (digits.length >= 9) {
    add(digits.slice(-9));
  }

  return [...variants];
}
