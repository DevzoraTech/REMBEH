/**
 * Overdue fine schedule helpers.
 *
 * Timeline (example):
 * - paymentStartDate = Day 0
 * - durationDays = 30 → maturity / dueDate = Day 30
 * - finePeriodDays = 10, fineAmount = X
 * - Still unpaid on Day 40 → apply periodIndex 1 (+X)
 * - Still unpaid on Day 50 → apply periodIndex 2 (+X)
 * - Recurs every finePeriodDays while balance > 0
 *
 * Idempotent by (loanId, periodIndex).
 */

export type FineScheduleInput = {
  paymentStartDate: Date;
  durationDays: number;
  finePeriodDays: number;
  /** Remaining outstanding (must be > 0 to accrue). */
  balance: number;
  asOf?: Date;
};

export type FinePeriodDue = {
  /** 1-based period after maturity. */
  periodIndex: number;
  /** Calendar date this period became due. */
  dueAt: Date;
};

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

/** Maturity / payment due end = paymentStartDate + durationDays. */
export function computeLoanDueDate(
  paymentStartDate: Date,
  durationDays: number,
): Date {
  const start = startOfDay(paymentStartDate);
  const due = new Date(start);
  due.setDate(due.getDate() + Math.max(0, durationDays));
  return due;
}

/**
 * Returns all fine period indices that are due as of `asOf` (inclusive),
 * when the loan is still outstanding. Does not check which are already applied.
 */
export function computeDueFinePeriods(
  input: FineScheduleInput,
): FinePeriodDue[] {
  const finePeriodDays = Math.floor(input.finePeriodDays);
  if (
    input.balance <= 0 ||
    finePeriodDays < 1 ||
    input.durationDays < 0
  ) {
    return [];
  }

  const dueDate = computeLoanDueDate(
    input.paymentStartDate,
    input.durationDays,
  );
  const asOf = startOfDay(input.asOf ?? new Date());
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysPastDue = Math.floor(
    (asOf.getTime() - dueDate.getTime()) / msPerDay,
  );
  // First fine at dueDate + finePeriodDays → daysPastDue >= finePeriodDays
  const maxIndex = Math.floor(daysPastDue / finePeriodDays);
  if (maxIndex < 1) {
    return [];
  }

  const periods: FinePeriodDue[] = [];
  for (let periodIndex = 1; periodIndex <= maxIndex; periodIndex += 1) {
    const dueAt = new Date(dueDate);
    dueAt.setDate(dueAt.getDate() + periodIndex * finePeriodDays);
    periods.push({ periodIndex, dueAt });
  }
  return periods;
}

/** Periods due that are not already in `appliedPeriodIndexes`. */
export function computeMissingFinePeriods(
  input: FineScheduleInput & { appliedPeriodIndexes: Iterable<number> },
): FinePeriodDue[] {
  const applied = new Set(input.appliedPeriodIndexes);
  return computeDueFinePeriods(input).filter(
    (period) => !applied.has(period.periodIndex),
  );
}
