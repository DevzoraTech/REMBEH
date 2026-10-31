import { calculateOpeningPosition } from './opening-position';

describe('opening position', () => {
  it('preserves the supplied balance and derives principal only from an explicit rate', () => {
    const result = calculateOpeningPosition({
      repayable: '240000',
      outstanding: '216000',
      flatInterestPercent: '20',
    });
    expect(result.principal?.toString()).toBe('200000');
    expect(result.outstanding.toString()).toBe('216000');
    expect(result.alreadyPaid.toString()).toBe('24000');
    expect(result.closed).toBe(false);
  });

  it('does not invent principal or payment history', () => {
    const result = calculateOpeningPosition({
      repayable: '100',
      outstanding: '0',
    });
    expect(result.principal).toBeNull();
    expect(result.closed).toBe(true);
  });

  it.each([
    { repayable: '100', outstanding: '101' },
    { repayable: '0', outstanding: '0' },
    { repayable: '100', outstanding: '-1' },
    { repayable: '100.001', outstanding: '0' },
    {
      repayable: '100',
      outstanding: '0',
      principal: '90',
      flatInterestPercent: '20',
    },
  ])('rejects inconsistent or invalid amounts', (input) => {
    expect(() => calculateOpeningPosition(input)).toThrow();
  });
});
