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
});
