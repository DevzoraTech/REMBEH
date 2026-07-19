import {
  looksLikePhoneQuery,
  phoneSearchVariants,
} from './identity-normalization';

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

  it('handles spaced international input', () => {
    const variants = phoneSearchVariants('+256 700 123456');
    expect(variants).toEqual(
      expect.arrayContaining(['+256700123456', '700123456', '0700123456']),
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
