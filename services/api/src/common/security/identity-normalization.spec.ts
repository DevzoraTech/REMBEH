import {
  isInternationalPhoneNumber,
  looksLikePhoneQuery,
  normalizeInternationalPhoneNumber,
  phoneSearchVariants,
} from './identity-normalization';

describe('normalizeInternationalPhoneNumber', () => {
  it('converts Uganda local 07 numbers to +256', () => {
    expect(normalizeInternationalPhoneNumber('0760347636')).toBe(
      '+256760347636',
    );
    expect(normalizeInternationalPhoneNumber('0760 347 636')).toBe(
      '+256760347636',
    );
  });

  it('converts 9-digit national mobiles to +256', () => {
    expect(normalizeInternationalPhoneNumber('760347636')).toBe(
      '+256760347636',
    );
  });

  it('keeps E.164 numbers', () => {
    expect(normalizeInternationalPhoneNumber('+256760347636')).toBe(
      '+256760347636',
    );
  });
});

describe('isInternationalPhoneNumber', () => {
  it('accepts normalized Uganda mobiles', () => {
    expect(
      isInternationalPhoneNumber(
        normalizeInternationalPhoneNumber('0760347636'),
      ),
    ).toBe(true);
  });
});

describe('phoneSearchVariants', () => {
  it('expands Uganda local numbers to E.164 variants', () => {
    const variants = phoneSearchVariants('0700123456');
    expect(variants).toEqual(
      expect.arrayContaining([
        '0700123456',
        '700123456',
        '+256700123456',
        '256700123456',
      ]),
    );
  });

  it('expands national digits without leading 0', () => {
    const variants = phoneSearchVariants('700123456');
    expect(variants).toEqual(
      expect.arrayContaining([
        '700123456',
        '0700123456',
        '+256700123456',
        '256700123456',
      ]),
    );
  });

  it('handles spaced international input', () => {
    const variants = phoneSearchVariants('+256 700 123456');
    expect(variants).toEqual(
      expect.arrayContaining(['+256700123456', '700123456', '0700123456']),
    );
  });

  it('strips leading 0 on partial local queries so they match E.164', () => {
    const variants = phoneSearchVariants('0700123');
    expect(variants).toEqual(
      expect.arrayContaining(['0700123', '700123', '+256700123', '256700123']),
    );
  });

  it('handles dashed and spaced local input', () => {
    const variants = phoneSearchVariants('0700-123-456');
    expect(variants).toEqual(
      expect.arrayContaining(['0700123456', '700123456', '+256700123456']),
    );
  });
});

describe('looksLikePhoneQuery', () => {
  it('detects digit-heavy queries', () => {
    expect(looksLikePhoneQuery('0700123456')).toBe(true);
    expect(looksLikePhoneQuery('+256700123456')).toBe(true);
    expect(looksLikePhoneQuery('Jane Doe')).toBe(false);
  });
});
