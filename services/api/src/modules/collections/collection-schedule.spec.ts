import {
  allocateRepayment,
  computeCollectionSchedule,
} from './collection-schedule';

describe('collection-schedule', () => {
  it('computes equal daily instalments and expected today', () => {
    const start = new Date(2026, 6, 1);
    const asOf = new Date(2026, 6, 10);
    const schedule = computeCollectionSchedule({
      principalAmount: 1_000_000,
      interestRatePercent: 0,
      durationDays: 10,
      processingFee: 0,
      balance: 1_000_000,
      startDate: start,
      asOf,
    });

    expect(schedule.totalRepayable).toBe(1_000_000);
    expect(schedule.dailyInstalment).toBe(100_000);
    expect(schedule.daysElapsed).toBe(10);
    expect(schedule.expectedToday).toBe(1_000_000);
    expect(schedule.paidAmount).toBe(0);
  });

  it('allocates fees then interest then principal', () => {
    const result = allocateRepayment({
      amount: 150,
      remainingFees: 50,
      remainingInterest: 40,
      remainingPrincipal: 1000,
    });
    expect(result.feesAllocated).toBe(50);
    expect(result.interestAllocated).toBe(40);
    expect(result.principalAllocated).toBe(60);
    expect(result.applied).toBe(150);
  });

  it('keeps paid at 0 when no repayments even if balance drifts from pricing', () => {
    const start = new Date(2026, 6, 1);
    const schedule = computeCollectionSchedule({
      principalAmount: 1_000_000,
      interestRatePercent: 20,
      durationDays: 30,
      processingFee: 50_000,
      // Balance equal to principal only (legacy / mis-mapped) would otherwise
      // show interest+fee as "paid".
      balance: 1_000_000,
      recordedPaidAmount: 0,
      startDate: start,
      asOf: start,
    });

    expect(schedule.paidAmount).toBe(0);
    expect(schedule.outstanding).toBe(1_000_000);
  });

  it('uses recorded repayment sum as paidAmount', () => {
    const start = new Date(2026, 6, 1);
    const schedule = computeCollectionSchedule({
      principalAmount: 1_000_000,
      interestRatePercent: 0,
      durationDays: 10,
      processingFee: 0,
      balance: 900_000,
      recordedPaidAmount: 100_000,
      startDate: start,
      asOf: start,
    });

    expect(schedule.paidAmount).toBe(100_000);
    expect(schedule.outstanding).toBe(900_000);
  });

  it('uses flat percent interest when no override (duration ignored for interest)', () => {
    const start = new Date(2026, 6, 1);
    const schedule = computeCollectionSchedule({
      principalAmount: 100_000,
      interestRatePercent: 12,
      durationDays: 90,
      processingFee: 0,
      balance: 112_000,
      recordedPaidAmount: 0,
      startDate: start,
      asOf: start,
    });

    expect(schedule.interestAmount).toBe(12_000);
    expect(schedule.totalRepayable).toBe(112_000);
  });

  it('prefers totalRepayableOverride snapshot over live pricing', () => {
    const start = new Date(2026, 6, 1);
    const schedule = computeCollectionSchedule({
      principalAmount: 100_000,
      interestRatePercent: 12,
      durationDays: 90,
      processingFee: 0,
      balance: 103_000,
      recordedPaidAmount: 0,
      // Legacy submit snapshot (old annualized formula) stays as stored.
      totalRepayableOverride: 103_000,
      startDate: start,
      asOf: start,
    });

    expect(schedule.totalRepayable).toBe(103_000);
    expect(schedule.interestAmount).toBe(3_000);
    expect(schedule.dailyInstalment).toBeCloseTo(103_000 / 90, 2);
  });
});
