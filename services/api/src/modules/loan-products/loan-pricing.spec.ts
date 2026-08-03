import { computeLoanPricing, resolveBaseRepayable } from './loan-pricing';

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

describe('resolveBaseRepayable', () => {
  it('keeps a wallet opening that already matches flat pricing', () => {
    expect(
      resolveBaseRepayable({
        openingBalance: 1_130_000,
        pricedTotal: 1_130_000,
        principal: 1_000_000,
      }),
    ).toBe(1_130_000);
  });

  it('replaces principal-only openings with flat pricing', () => {
    expect(
      resolveBaseRepayable({
        openingBalance: 2_500_000,
        pricedTotal: 2_905_400,
        principal: 2_500_000,
      }),
    ).toBe(2_905_400);
  });

  it('replaces legacy annualized openings with flat pricing', () => {
    expect(
      resolveBaseRepayable({
        openingBalance: 4_560_879.45,
        pricedTotal: 5_180_400,
        principal: 4_500_000,
      }),
    ).toBe(5_180_400);
  });
});
