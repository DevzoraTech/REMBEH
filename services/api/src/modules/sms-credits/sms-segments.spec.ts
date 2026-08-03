import {
  analyzeSmsBody,
  normalizeUgPhoneTo256,
} from './sms-segments';

describe('analyzeSmsBody', () => {
  it('counts a short GSM-7 message as one segment', () => {
    const result = analyzeSmsBody('Hello REMBEH borrower');
    expect(result.encoding).toBe('GSM7');
    expect(result.segmentsRequired).toBe(1);
  });

  it('splits long GSM-7 into 153-char segments', () => {
    const body = 'A'.repeat(161);
    const result = analyzeSmsBody(body);
    expect(result.encoding).toBe('GSM7');
    expect(result.segmentsRequired).toBe(2);
  });

  it('uses Unicode segment sizes for non-GSM characters', () => {
    const result = analyzeSmsBody('你好');
    expect(result.encoding).toBe('UNICODE');
    expect(result.segmentsRequired).toBe(1);
  });

  it('splits long Unicode into 67-char segments', () => {
    const body = '你'.repeat(71);
    const result = analyzeSmsBody(body);
    expect(result.encoding).toBe('UNICODE');
    expect(result.segmentsRequired).toBe(2);
  });
});

describe('normalizeUgPhoneTo256', () => {
  it('normalizes local 07 numbers', () => {
    expect(normalizeUgPhoneTo256('0772123456')).toBe('256772123456');
  });

  it('accepts already-normalized 256 numbers', () => {
    expect(normalizeUgPhoneTo256('+256772123456')).toBe('256772123456');
  });

  it('rejects invalid phones', () => {
    expect(normalizeUgPhoneTo256('123')).toBeNull();
  });
});
