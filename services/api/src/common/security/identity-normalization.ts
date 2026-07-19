export function normalizeEmailAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeInternationalPhoneNumber(value: string): string {
  return value.trim().replace(/[\s()-]/g, '');
}

export function isInternationalPhoneNumber(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}
