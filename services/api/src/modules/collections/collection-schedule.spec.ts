import {
  describe,
  expect,
  it,
} from '@jest/globals';

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
      repaymentFrequency: 'DAILY',
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

  it('allocates fines then interest then principal', () => {
    const result = allocateRepayment({
      amount: 150,
      remainingFees: 50,
      remainingInterest: 40,
      remainingPrincipal: 1_000,
    });

    expect(result.feesAllocated).toBe(50);
    expect(result.interestAllocated).toBe(40);
    expect(result.principalAllocated).toBe(60);
    expect(result.applied).toBe(150);
  });

  it('keeps paid at 0 when no repayments even if balance differs from pricing', () => {
    const start = new Date(2026, 6, 1);

    const schedule = computeCollectionSchedule({
      principalAmount: 1_000_000,
      interestRatePercent: 20,
      durationDays: 30,
      repaymentFrequency: 'DAILY',
      processingFee: 50_000,
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
      repaymentFrequency: 'DAILY',
      processingFee: 0,
      balance: 900_000,
      recordedPaidAmount: 100_000,
      startDate: start,
      asOf: start,
    });

    expect(schedule.paidAmount).toBe(100_000);
    expect(schedule.outstanding).toBe(900_000);
  });

  it('uses flat percent interest when no override', () => {
    const start = new Date(2026, 6, 1);

    const schedule = computeCollectionSchedule({
      principalAmount: 100_000,
      interestRatePercent: 12,
      durationDays: 90,
      repaymentFrequency: 'DAILY',
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
      repaymentFrequency: 'DAILY',
      processingFee: 0,
      balance: 103_000,
      recordedPaidAmount: 0,
      totalRepayableOverride: 103_000,
      startDate: start,
      asOf: start,
    });

    expect(schedule.totalRepayable).toBe(103_000);
    expect(schedule.interestAmount).toBe(3_000);
    expect(schedule.dailyInstalment).toBeCloseTo(
      103_000 / 90,
      2,
    );
  });

  it('does not include processing fee in borrower debt', () => {
    const start = new Date(2026, 7, 27);

    const schedule = computeCollectionSchedule({
      principalAmount: 1_000_000,
      interestRatePercent: 10,
      durationDays: 10,
      repaymentFrequency: 'DAILY',
      processingFee: 50_000,
      balance: 1_100_000,
      recordedPaidAmount: 0,
      startDate: start,
      asOf: start,
    });

    expect(schedule.principalAmount).toBe(1_000_000);
    expect(schedule.interestAmount).toBe(100_000);
    expect(schedule.processingFee).toBe(50_000);

    /*
     * Processing fee is separate income.
     *
     * Borrower debt:
     * 1,000,000 principal
     * + 100,000 interest
     * = 1,100,000
     */
    expect(schedule.totalRepayable).toBe(1_100_000);

    expect(schedule.dailyInstalment).toBe(110_000);
  });

  it('does not make a NEXT_DAY loan due on the disbursement day', () => {
    /*
     * Loan may have been issued on 26 Aug,
     * but its stored paymentStartDate is 27 Aug.
     *
     * collection-schedule receives paymentStartDate as startDate.
     */
    const firstRepaymentDate = new Date(2026, 7, 27);
    const asOf = new Date(2026, 7, 26);

    const schedule = computeCollectionSchedule({
      principalAmount: 1_000_000,
      interestRatePercent: 10,
      durationDays: 10,
      repaymentFrequency: 'DAILY',
      processingFee: 20_000,
      balance: 1_100_000,
      recordedPaidAmount: 0,
      startDate: firstRepaymentDate,
      asOf,
    });

    expect(schedule.daysElapsed).toBe(0);
    expect(schedule.expectedCumulative).toBe(0);
    expect(schedule.expectedToday).toBe(0);
    expect(schedule.carriedForward).toBe(0);
    expect(schedule.nextDueIsToday).toBe(false);
    expect(schedule.nextDueLabel).toBe('Due in 1 day');
  });

  it('makes the first instalment due on paymentStartDate', () => {
    const firstRepaymentDate = new Date(2026, 7, 27);

    const schedule = computeCollectionSchedule({
      principalAmount: 1_000_000,
      interestRatePercent: 10,
      durationDays: 10,
      repaymentFrequency: 'DAILY',
      processingFee: 20_000,
      balance: 1_100_000,
      recordedPaidAmount: 0,
      startDate: firstRepaymentDate,
      asOf: firstRepaymentDate,
    });

    expect(schedule.daysElapsed).toBe(1);
    expect(schedule.expectedCumulative).toBe(110_000);
    expect(schedule.expectedToday).toBe(110_000);
    expect(schedule.carriedForward).toBe(0);
    expect(schedule.nextDueIsToday).toBe(true);
    expect(schedule.nextDueLabel).toBe('Due today');
  });

  it('does not mark the first repayment day as overdue', () => {
    const firstRepaymentDate = new Date(2026, 7, 27);

    const schedule = computeCollectionSchedule({
      principalAmount: 300_000,
      interestRatePercent: 0,
      durationDays: 3,
      repaymentFrequency: 'DAILY',
      processingFee: 0,
      balance: 300_000,
      recordedPaidAmount: 0,
      startDate: firstRepaymentDate,
      asOf: firstRepaymentDate,
    });

    expect(schedule.daysElapsed).toBe(1);
    expect(schedule.expectedToday).toBe(100_000);
    expect(schedule.carriedForward).toBe(0);
    expect(schedule.nextDueLabel).toBe('Due today');
  });

  it('marks unpaid prior daily instalments as arrears after the first repayment day', () => {
    const firstRepaymentDate = new Date(2026, 7, 27);

    const schedule = computeCollectionSchedule({
      principalAmount: 300_000,
      interestRatePercent: 0,
      durationDays: 3,
      repaymentFrequency: 'DAILY',
      processingFee: 0,
      balance: 300_000,
      recordedPaidAmount: 0,
      startDate: firstRepaymentDate,
      asOf: new Date(2026, 7, 28),
    });

    expect(schedule.daysElapsed).toBe(2);
    expect(schedule.expectedToday).toBe(200_000);
    expect(schedule.carriedForward).toBe(100_000);
    expect(schedule.nextDueLabel).toBe('Overdue');
  });

  it('does not demand a weekly repayment every day', () => {
    const firstRepaymentDate = new Date(2026, 7, 27);

    /*
     * 28-day term:
     *
     * 27 Aug
     * 3 Sep
     * 10 Sep
     * 17 Sep
     * 23 Sep maturity
     */
    const firstDue = computeCollectionSchedule({
      principalAmount: 500_000,
      interestRatePercent: 0,
      durationDays: 28,
      repaymentFrequency: 'WEEKLY',
      processingFee: 0,
      balance: 500_000,
      recordedPaidAmount: 0,
      startDate: firstRepaymentDate,
      asOf: firstRepaymentDate,
    });

    expect(firstDue.daysElapsed).toBe(1);
    expect(firstDue.expectedToday).toBe(100_000);
    expect(firstDue.nextDueIsToday).toBe(true);

    /*
     * Simulate payment of first weekly instalment.
     *
     * The next day must NOT create another instalment.
     */
    const nextDay = computeCollectionSchedule({
      principalAmount: 500_000,
      interestRatePercent: 0,
      durationDays: 28,
      repaymentFrequency: 'WEEKLY',
      processingFee: 0,
      balance: 400_000,
      recordedPaidAmount: 100_000,
      startDate: firstRepaymentDate,
      asOf: new Date(2026, 7, 28),
    });

    expect(nextDay.daysElapsed).toBe(1);
    expect(nextDay.expectedToday).toBe(0);
    expect(nextDay.nextDueIsToday).toBe(false);
    expect(nextDay.nextDueLabel).toBe('Due in 6 days');
  });

  it('makes the second weekly instalment due seven calendar days later', () => {
    const firstRepaymentDate = new Date(2026, 7, 27);

    const schedule = computeCollectionSchedule({
      principalAmount: 500_000,
      interestRatePercent: 0,
      durationDays: 28,
      repaymentFrequency: 'WEEKLY',
      processingFee: 0,
      balance: 400_000,
      recordedPaidAmount: 100_000,
      startDate: firstRepaymentDate,
      asOf: new Date(2026, 8, 3),
    });

    expect(schedule.daysElapsed).toBe(2);
    expect(schedule.expectedToday).toBe(100_000);
    expect(schedule.nextDueIsToday).toBe(true);
    expect(schedule.nextDueLabel).toBe('Due today');
  });

  it('supports biweekly repayment frequency', () => {
    const firstRepaymentDate = new Date(2026, 7, 27);

    const beforeSecondPayment = computeCollectionSchedule({
      principalAmount: 300_000,
      interestRatePercent: 0,
      durationDays: 30,
      repaymentFrequency: 'BIWEEKLY',
      processingFee: 0,
      balance: 200_000,
      recordedPaidAmount: 100_000,
      startDate: firstRepaymentDate,
      asOf: new Date(2026, 8, 2),
    });

    expect(beforeSecondPayment.expectedToday).toBe(0);
    expect(beforeSecondPayment.nextDueIsToday).toBe(false);

    const secondPaymentDate = computeCollectionSchedule({
      principalAmount: 300_000,
      interestRatePercent: 0,
      durationDays: 30,
      repaymentFrequency: 'BIWEEKLY',
      processingFee: 0,
      balance: 200_000,
      recordedPaidAmount: 100_000,
      startDate: firstRepaymentDate,
      asOf: new Date(2026, 8, 10),
    });

    expect(secondPaymentDate.daysElapsed).toBe(2);
    expect(secondPaymentDate.expectedToday).toBe(100_000);
  });

  it('supports monthly repayment frequency', () => {
    const firstRepaymentDate = new Date(2026, 0, 31);

    const schedule = computeCollectionSchedule({
      principalAmount: 300_000,
      interestRatePercent: 0,
      durationDays: 90,
      repaymentFrequency: 'MONTHLY',
      processingFee: 0,
      balance: 225_000,
      recordedPaidAmount: 75_000,
      startDate: firstRepaymentDate,
      asOf: new Date(2026, 1, 27),
    });

    /*
     * January 31 payment already covered.
     *
     * February payment has not reached its scheduled
     * end-of-month-safe date yet.
     */
    expect(schedule.expectedToday).toBe(0);
    expect(schedule.nextDueIsToday).toBe(false);
  });

  it('supports lump-sum repayment and only makes debt due at maturity', () => {
    const firstRepaymentAnchor = new Date(2026, 7, 27);

    const beforeMaturity = computeCollectionSchedule({
      principalAmount: 1_000_000,
      interestRatePercent: 10,
      durationDays: 30,
      repaymentFrequency: 'LUMP_SUM',
      processingFee: 50_000,
      balance: 1_100_000,
      recordedPaidAmount: 0,
      startDate: firstRepaymentAnchor,
      asOf: new Date(2026, 8, 10),
    });

    expect(beforeMaturity.expectedToday).toBe(0);
    expect(beforeMaturity.nextDueIsToday).toBe(false);
    expect(beforeMaturity.totalRepayable).toBe(1_100_000);

    /*
     * 27 Aug + 29 days = 25 Sep.
     */
    const maturity = computeCollectionSchedule({
      principalAmount: 1_000_000,
      interestRatePercent: 10,
      durationDays: 30,
      repaymentFrequency: 'LUMP_SUM',
      processingFee: 50_000,
      balance: 1_100_000,
      recordedPaidAmount: 0,
      startDate: firstRepaymentAnchor,
      asOf: new Date(2026, 8, 25),
    });

    expect(maturity.expectedToday).toBe(1_100_000);
    expect(maturity.nextDueIsToday).toBe(true);
    expect(maturity.nextDueLabel).toBe('Due today');
  });

  it('respects advance repayment and moves next due date forward', () => {
    const start = new Date(2026, 7, 27);

    const schedule = computeCollectionSchedule({
      principalAmount: 1_000_000,
      interestRatePercent: 0,
      durationDays: 10,
      repaymentFrequency: 'DAILY',
      processingFee: 0,
      balance: 700_000,
      recordedPaidAmount: 300_000,
      startDate: start,
      asOf: start,
    });

    expect(schedule.expectedToday).toBe(0);
    expect(schedule.nextDueIsToday).toBe(false);

    /*
     * Three instalments have already been covered.
     *
     * 27 Aug = #1
     * 28 Aug = #2
     * 29 Aug = #3
     *
     * next due = 30 Aug.
     */
    expect(schedule.nextDueLabel).toBe(
      'Due in 3 days',
    );
  });
});