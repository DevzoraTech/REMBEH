import { computeLoanPricing } from '../loan-products/loan-pricing';

export type RepaymentFrequency =
  'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'LUMP_SUM';

export type CollectionScheduleInput = {
  principalAmount: number;

  interestRatePercent: number;

  /**
   * Contractual loan term in calendar days.
   */
  durationDays: number;

  /**
   * Repayment cadence copied from the loan product/application snapshot.
   */
  repaymentFrequency?: RepaymentFrequency | string | null;

  /**
   * Separate business income.
   *
   * Processing fee MUST NOT form part of borrower debt.
   */
  processingFee: number;

  /**
   * Current borrower debt.
   *
   * Includes:
   * - principal
   * - interest
   * - applied fines where applicable
   *
   * Excludes:
   * - processing fee
   */
  balance: number;

  /**
   * Actual recorded loan repayments.
   *
   * Processing-fee receipts must not be included.
   */
  recordedPaidAmount?: number;

  /**
   * Contractual borrower debt snapshot.
   *
   * principal + interest
   *
   * Excludes:
   * - processing fee
   * - later fines
   */
  totalRepayableOverride?: number;

  /**
   * FIRST contractual repayment date.
   *
   * This is NOT necessarily the loan-disbursement date.
   */
  startDate: Date;

  asOf?: Date;
};

export type CollectionSchedule = {
  principalAmount: number;

  interestAmount: number;

  /**
   * Separate fee information only.
   */
  processingFee: number;

  /**
   * principal + interest
   */
  totalRepayable: number;

  paidAmount: number;

  outstanding: number;

  /**
   * Amount per scheduled repayment occurrence.
   *
   * Despite the legacy field name, this is not necessarily a daily amount.
   */
  dailyInstalment: number;

  /**
   * Number of scheduled repayment occurrences that have become due.
   *
   * Before the first repayment date = 0.
   */
  daysElapsed: number;

  /**
   * Calendar days remaining until maturity.
   */
  daysLeft: number;

  /**
   * Number of scheduled repayment occurrences.
   *
   * Legacy field name retained for API compatibility.
   */
  loanPeriodDays: number;

  expectedCumulative: number;

  expectedToday: number;

  carriedForward: number;

  nextDueLabel: string;

  nextDueIsToday: boolean;

  /**
   * Legacy API name.
   *
   * Represents the first scheduled repayment date.
   */
  loanStartDate: string;

  maturityDate: string;
};

// =============================================================================
// DATE HELPERS
// =============================================================================

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function calendarDayDifference(left: Date, right: Date): number {
  const leftUtc = Date.UTC(left.getFullYear(), left.getMonth(), left.getDate());

  const rightUtc = Date.UTC(
    right.getFullYear(),
    right.getMonth(),
    right.getDate(),
  );

  return Math.round((rightUtc - leftUtc) / 86_400_000);
}

function addCalendarDays(date: Date, days: number): Date {
  const result = startOfDay(date);

  result.setDate(result.getDate() + days);

  return result;
}

function addCalendarMonths(date: Date, months: number): Date {
  const source = startOfDay(date);

  const originalDay = source.getDate();

  /*
   * Move to the first of the target month first.
   *
   * This prevents dates such as 31 January + 1 month
   * from overflowing unpredictably into March.
   */
  const target = new Date(source.getFullYear(), source.getMonth() + months, 1);

  const lastDayOfTargetMonth = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
  ).getDate();

  target.setDate(Math.min(originalDay, lastDayOfTargetMonth));

  return target;
}

function isSameCalendarDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

// =============================================================================
// MONEY
// =============================================================================

function roundMoney(value: number): number {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.round((numeric + Number.EPSILON) * 100) / 100;
}

// =============================================================================
// FREQUENCY
// =============================================================================

function normaliseRepaymentFrequency(
  value: string | null | undefined,
): RepaymentFrequency {
  switch (value?.trim().toUpperCase()) {
    case 'WEEKLY':
      return 'WEEKLY';

    case 'BIWEEKLY':
      return 'BIWEEKLY';

    case 'MONTHLY':
      return 'MONTHLY';

    case 'LUMP_SUM':
      return 'LUMP_SUM';

    case 'DAILY':
    default:
      return 'DAILY';
  }
}

// =============================================================================
// DUE DATE GENERATION
// =============================================================================

function buildScheduledDates(input: {
  firstRepaymentDate: Date;

  durationDays: number;

  repaymentFrequency: RepaymentFrequency;
}): Date[] {
  const first = startOfDay(input.firstRepaymentDate);

  const durationDays = Math.max(1, Math.trunc(input.durationDays));

  /*
   * The contractual term starts on the first repayment date.
   *
   * Example:
   *
   * 30-day term
   * first repayment = 27 Aug
   *
   * term end = 25 Sep
   */
  const maturity = addCalendarDays(first, durationDays - 1);

  if (input.repaymentFrequency === 'LUMP_SUM') {
    return [maturity];
  }

  const dates: Date[] = [];

  if (input.repaymentFrequency === 'MONTHLY') {
    let occurrence = 0;

    while (true) {
      const date = addCalendarMonths(first, occurrence);

      if (date.getTime() > maturity.getTime()) {
        break;
      }

      dates.push(date);

      occurrence += 1;
    }
  } else {
    const intervalDays =
      input.repaymentFrequency === 'WEEKLY'
        ? 7
        : input.repaymentFrequency === 'BIWEEKLY'
          ? 14
          : 1;

    let date = new Date(first);

    while (date.getTime() <= maturity.getTime()) {
      dates.push(new Date(date));

      date = addCalendarDays(date, intervalDays);
    }

    const lastDate = dates[dates.length - 1];
    if (
      input.repaymentFrequency !== 'DAILY' &&
      lastDate != null &&
      !isSameCalendarDay(lastDate, maturity) &&
      calendarDayDifference(lastDate, maturity) === 1
    ) {
      dates[dates.length - 1] = maturity;
    }
  }

  /*
   * For a non-lump schedule, maturity should still represent a
   * final contractual payment point.
   *
   * Example:
   *
   * 30-day weekly loan:
   * day 1, 8, 15, 22, 29...
   *
   * If day 30 is not exactly on the normal cadence, the remaining
   * balance becomes contractually due at maturity.
   */
  if (
    dates.length === 0 ||
    !isSameCalendarDay(dates[dates.length - 1], maturity)
  ) {
    dates.push(maturity);
  }

  return dates;
}

// =============================================================================
// COLLECTION SCHEDULE
// =============================================================================

export function computeCollectionSchedule(
  input: CollectionScheduleInput,
): CollectionSchedule {
  const durationDays = Math.max(1, Math.trunc(Number(input.durationDays) || 1));

  const repaymentFrequency = normaliseRepaymentFrequency(
    input.repaymentFrequency,
  );

  const pricing = computeLoanPricing({
    principalAmount: input.principalAmount,

    interestRatePercent: input.interestRatePercent,

    durationDays,

    processingFee: input.processingFee,
  });

  // ==========================================================================
  // BORROWER DEBT
  // ==========================================================================

  const totalRepayable =
    input.totalRepayableOverride != null
      ? roundMoney(Math.max(0, Number(input.totalRepayableOverride) || 0))
      : roundMoney(Math.max(0, pricing.totalRepayable));

  /*
   * Processing fee is deliberately excluded.
   */
  const interestAmount =
    input.totalRepayableOverride != null
      ? roundMoney(Math.max(0, totalRepayable - pricing.principalAmount))
      : roundMoney(Math.max(0, pricing.interestAmount));

  const outstanding = roundMoney(Math.max(0, Number(input.balance) || 0));

  const paidAmount =
    input.recordedPaidAmount != null
      ? roundMoney(Math.max(0, Number(input.recordedPaidAmount) || 0))
      : roundMoney(Math.max(0, totalRepayable - outstanding));

  // ==========================================================================
  // REPAYMENT CALENDAR
  // ==========================================================================

  const asOf = startOfDay(input.asOf ?? new Date());

  const firstRepaymentDate = startOfDay(input.startDate);

  const scheduledDates = buildScheduledDates({
    firstRepaymentDate,

    durationDays,

    repaymentFrequency,
  });

  const scheduledPayments = Math.max(1, scheduledDates.length);

  const maturity = scheduledDates[scheduledDates.length - 1];

  // ==========================================================================
  // INSTALMENT
  // ==========================================================================

  /*
   * Historical API field name is dailyInstalment.
   *
   * Its actual meaning is now:
   *
   * amount per scheduled repayment occurrence.
   */
  const dailyInstalment = roundMoney(totalRepayable / scheduledPayments);

  const fullyPaid = outstanding <= 0;

  const repaymentNotStarted = asOf.getTime() < scheduledDates[0].getTime();

  const afterMaturity = asOf.getTime() > maturity.getTime();

  // ==========================================================================
  // DUE OCCURRENCES
  // ==========================================================================

  const dueDatesThroughToday = scheduledDates.filter(
    (date) => date.getTime() <= asOf.getTime(),
  );

  const dueOccurrences = repaymentNotStarted ? 0 : dueDatesThroughToday.length;

  /*
   * Retained under legacy API field name.
   *
   * This now means scheduled instalments elapsed,
   * not literal calendar days.
   */
  const daysElapsed = dueOccurrences;

  // ==========================================================================
  // EXPECTED CUMULATIVE
  // ==========================================================================

  const expectedCumulative =
    dueOccurrences <= 0
      ? 0
      : dueOccurrences >= scheduledPayments
        ? totalRepayable
        : roundMoney(
            Math.min(totalRepayable, dailyInstalment * dueOccurrences),
          );

  const owedThroughToday = roundMoney(
    Math.max(0, expectedCumulative - paidAmount),
  );

  const expectedToday = repaymentNotStarted
    ? 0
    : roundMoney(Math.min(outstanding, owedThroughToday));

  // ==========================================================================
  // COVERED OCCURRENCES
  // ==========================================================================

  const coveredOccurrences =
    dailyInstalment <= 0
      ? 0
      : Math.min(
          scheduledPayments,
          Math.floor((Math.max(0, paidAmount) + 0.001) / dailyInstalment),
        );

  /*
   * Arrears represent scheduled obligations from prior due occurrences,
   * excluding the current normal instalment.
   */
  const carriedForward =
    expectedToday <= 0
      ? 0
      : roundMoney(Math.max(0, expectedToday - dailyInstalment));

  // ==========================================================================
  // FIND NEXT CONTRACTUAL DUE DATE
  // ==========================================================================

  let nextScheduledDate: Date | null = null;

  if (!fullyPaid) {
    /*
     * Advance payments may cover future scheduled occurrences.
     *
     * Therefore the next due occurrence starts after however many
     * instalments have already been economically covered.
     */
    const candidateIndex = Math.max(coveredOccurrences, dueOccurrences);

    if (expectedToday > 0 && dueOccurrences > 0) {
      /*
       * There is unpaid contractual debt due already.
       *
       * The current/oldest unpaid obligation is due now.
       */
      nextScheduledDate = asOf;
    } else if (candidateIndex < scheduledDates.length) {
      nextScheduledDate = scheduledDates[candidateIndex];
    } else if (outstanding > 0) {
      nextScheduledDate = maturity;
    }
  }

  // ==========================================================================
  // DUE / OVERDUE
  // ==========================================================================

  const scheduledToday = scheduledDates.some((date) =>
    isSameCalendarDay(date, asOf),
  );

  /*
   * "Due today" means a contractual amount is due on the current
   * business day and remains unpaid.
   */
  const nextDueIsToday =
    !fullyPaid &&
    expectedToday > 0 &&
    (scheduledToday || carriedForward > 0 || afterMaturity);

  let nextDueLabel = 'Paid up';

  if (!fullyPaid) {
    if (repaymentNotStarted) {
      const days = Math.max(1, calendarDayDifference(asOf, scheduledDates[0]));

      nextDueLabel = `Due in ${days} day${days === 1 ? '' : 's'}`;
    } else if (afterMaturity && outstanding > 0) {
      nextDueLabel = 'Overdue';
    } else if (expectedToday > 0) {
      /*
       * There is money contractually payable by today.
       */
      if (scheduledToday && carriedForward <= 0) {
        nextDueLabel = 'Due today';
      } else if (carriedForward > 0) {
        nextDueLabel = 'Overdue';
      } else {
        nextDueLabel = 'Due today';
      }
    } else if (nextScheduledDate != null) {
      const days = calendarDayDifference(asOf, nextScheduledDate);

      if (days <= 0) {
        nextDueLabel = 'Due today';
      } else {
        nextDueLabel = `Due in ${days} day${days === 1 ? '' : 's'}`;
      }
    } else if (outstanding > 0) {
      nextDueLabel = isSameCalendarDay(asOf, maturity)
        ? 'Due today'
        : 'Overdue';
    }
  }

  // ==========================================================================
  // DAYS LEFT
  // ==========================================================================

  const calendarDaysLeft = Math.max(0, calendarDayDifference(asOf, maturity));

  // ==========================================================================
  // RETURN
  // ==========================================================================

  return {
    principalAmount: pricing.principalAmount,

    interestAmount,

    processingFee: pricing.processingFee,

    totalRepayable,

    paidAmount,

    outstanding,

    dailyInstalment,

    daysElapsed,

    daysLeft: calendarDaysLeft,

    /*
     * API compatibility.
     *
     * This now represents number of scheduled repayment occurrences.
     */
    loanPeriodDays: scheduledPayments,

    expectedCumulative,

    expectedToday,

    carriedForward,

    nextDueLabel,

    nextDueIsToday,

    loanStartDate: scheduledDates[0].toISOString(),

    maturityDate: maturity.toISOString(),
  };
}

// =============================================================================
// REPAYMENT ALLOCATION
// =============================================================================

/**
 * Allocate a loan repayment.
 *
 * Processing fee is NOT allocated here.
 *
 * remainingFees means:
 *
 * - fines
 * - penalties
 *
 * Allocation:
 *
 * fines → interest → principal
 */
export function allocateRepayment(input: {
  amount: number;

  remainingFees: number;

  remainingInterest: number;

  remainingPrincipal: number;
}) {
  let left = roundMoney(Math.max(0, Number(input.amount) || 0));

  const feesAllocated = roundMoney(
    Math.min(left, Math.max(0, Number(input.remainingFees) || 0)),
  );

  left = roundMoney(Math.max(0, left - feesAllocated));

  const interestAllocated = roundMoney(
    Math.min(left, Math.max(0, Number(input.remainingInterest) || 0)),
  );

  left = roundMoney(Math.max(0, left - interestAllocated));

  const principalAllocated = roundMoney(
    Math.min(left, Math.max(0, Number(input.remainingPrincipal) || 0)),
  );

  return {
    feesAllocated,

    interestAllocated,

    principalAllocated,

    applied: roundMoney(feesAllocated + interestAllocated + principalAllocated),
  };
}
