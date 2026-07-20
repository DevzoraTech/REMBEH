import {
  computeDueFinePeriods,
  computeLoanDueDate,
  computeMissingFinePeriods,
} from './loan-fine-schedule';

describe('loan-fine-schedule', () => {
  const start = new Date(2026, 0, 1); // 1 Jan 2026 local

  it('computes due date as paymentStart + durationDays', () => {
    expect(computeLoanDueDate(start, 30)).toEqual(new Date(2026, 0, 31));
  });

  it('does not fine before first interval after maturity', () => {
    // Maturity = 31 Jan; first fine = 10 Feb
    expect(
      computeDueFinePeriods({
        paymentStartDate: start,
        durationDays: 30,
        finePeriodDays: 10,
        balance: 1000,
        asOf: new Date(2026, 1, 9),
      }),
    ).toEqual([]);
  });

  it('applies first fine on dueDate + finePeriodDays', () => {
    const periods = computeDueFinePeriods({
      paymentStartDate: start,
      durationDays: 30,
      finePeriodDays: 10,
      balance: 1000,
      asOf: new Date(2026, 1, 10),
    });
    expect(periods).toHaveLength(1);
    expect(periods[0]?.periodIndex).toBe(1);
    expect(periods[0]?.dueAt).toEqual(new Date(2026, 1, 10));
  });

  it('applies recurring fines every finePeriodDays while overdue', () => {
    const periods = computeDueFinePeriods({
      paymentStartDate: start,
      durationDays: 30,
      finePeriodDays: 10,
      balance: 500,
      asOf: new Date(2026, 1, 20),
    });
    expect(periods.map((p) => p.periodIndex)).toEqual([1, 2]);
    expect(periods[1]?.dueAt).toEqual(new Date(2026, 1, 20));
  });

  it('skips already-applied period indexes (idempotent)', () => {
    const missing = computeMissingFinePeriods({
      paymentStartDate: start,
      durationDays: 30,
      finePeriodDays: 10,
      balance: 500,
      asOf: new Date(2026, 1, 20),
      appliedPeriodIndexes: [1],
    });
    expect(missing.map((p) => p.periodIndex)).toEqual([2]);
  });

  it('returns no periods when balance is zero', () => {
    expect(
      computeDueFinePeriods({
        paymentStartDate: start,
        durationDays: 30,
        finePeriodDays: 10,
        balance: 0,
        asOf: new Date(2026, 2, 1),
      }),
    ).toEqual([]);
  });
});
