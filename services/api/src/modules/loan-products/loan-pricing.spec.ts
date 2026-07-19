import { computeLoanPricing } from './loan-pricing';

describe('computeLoanPricing', () => {
  it('computes simple annualized interest and total repayable', () => {
    const result = computeLoanPricing({
      principalAmount: 1_000_000,
      interestRatePercent: 12,
      durationDays: 90,
      processingFee: 10_000,
    });

    // 1_000_000 * 0.12 * (90/365) ≈ 29589.04
    expect(result.interestAmount).toBeCloseTo(29589.04, 1);
    expect(result.totalRepayable).toBeCloseTo(1_039_589.04, 1);
    expect(result.processingFee).toBe(10_000);
  });
});
