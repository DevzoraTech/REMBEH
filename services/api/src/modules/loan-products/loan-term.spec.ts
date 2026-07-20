import {
  computePenaltyFineAmount,
  computeProcessingFeeAmount,
  describeLoanTerm,
  termToDurationDays,
} from './loan-term';

describe('loan-term helpers', () => {
  it('converts term units to days', () => {
    expect(termToDurationDays(30, 'DAYS')).toBe(30);
    expect(termToDurationDays(3, 'MONTHS')).toBe(90);
    expect(termToDurationDays(1, 'YEARS')).toBe(365);
  });

  it('describes terms', () => {
    expect(describeLoanTerm(1, 'DAYS')).toBe('1 day');
    expect(describeLoanTerm(3, 'MONTHS')).toBe('3 months');
  });

  it('computes penalty as % of principal', () => {
    expect(
      computePenaltyFineAmount({
        principalAmount: 100_000,
        penaltyRatePercent: 5,
      }),
    ).toBe(5000);
  });

  it('computes processing fee from percent', () => {
    expect(
      computeProcessingFeeAmount({
        principalAmount: 200_000,
        processingFeePercent: 2.5,
      }),
    ).toBe(5000);
  });
});
