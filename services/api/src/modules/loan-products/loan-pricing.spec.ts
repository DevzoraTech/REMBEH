import { computeLoanPricing } from './loan-pricing';

describe('computeLoanPricing', () => {
  it('computes flat percent interest and total repayable (no duration factor)', () => {
    const result = computeLoanPricing({
      principalAmount: 100_000,
      interestRatePercent: 12,
      durationDays: 90,
      processingFee: 0,
    });

    // loanRate = 100_000 * 0.12 = 12_000; repayable = 112_000
    expect(result.interestAmount).toBe(12_000);
    expect(result.totalRepayable).toBe(112_000);
    expect(result.durationDays).toBe(90);
  });

  it('adds processing fee to total repayable', () => {
    const result = computeLoanPricing({
      principalAmount: 1_000_000,
      interestRatePercent: 12,
      durationDays: 30,
      processingFee: 10_000,
    });

    expect(result.interestAmount).toBe(120_000);
    expect(result.totalRepayable).toBe(1_130_000);
    expect(result.processingFee).toBe(10_000);
  });

  it('ignores duration when computing interest', () => {
    const short = computeLoanPricing({
      principalAmount: 50_000,
      interestRatePercent: 10,
      durationDays: 7,
    });
    const long = computeLoanPricing({
      principalAmount: 50_000,
      interestRatePercent: 10,
      durationDays: 365,
    });

    expect(short.interestAmount).toBe(5_000);
    expect(long.interestAmount).toBe(5_000);
    expect(short.totalRepayable).toBe(long.totalRepayable);
  });

  it('uses flat interim preview for reducing/compound types', () => {
    const flat = computeLoanPricing({
      principalAmount: 100_000,
      interestRatePercent: 12,
      durationDays: 30,
      interestType: 'FLAT',
    });
    const reducing = computeLoanPricing({
      principalAmount: 100_000,
      interestRatePercent: 12,
      durationDays: 30,
      interestType: 'REDUCING_BALANCE',
    });
    const compound = computeLoanPricing({
      principalAmount: 100_000,
      interestRatePercent: 12,
      durationDays: 30,
      interestType: 'COMPOUND',
    });

    expect(reducing.interestAmount).toBe(flat.interestAmount);
    expect(compound.interestAmount).toBe(flat.interestAmount);
  });
});
