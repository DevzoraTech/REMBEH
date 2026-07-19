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
 * Phone search variants so local `0700…`, `700…`, `256…`, and `+256…`
 * all match stored E.164 numbers.
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

  add(noSep);
  add(digits);

  if (digits.startsWith('0') && digits.length >= 9) {
    const national = digits.slice(1);
    add(`+256${national}`);
    add(`256${national}`);
    add(national);
    add(`0${national}`);
  } else if (digits.startsWith('256') && digits.length >= 11) {
    const national = digits.slice(3);
    add(`+${digits}`);
    add(digits);
    add(national);
    add(`0${national}`);
  } else if (
    digits.length >= 8 &&
    digits.length <= 10 &&
    !digits.startsWith('0')
  ) {
    add(`+256${digits}`);
    add(`256${digits}`);
    add(`0${digits}`);
  }

  if (digits.length >= 9) {
    add(digits.slice(-9));
  }

  return [...variants];
}
