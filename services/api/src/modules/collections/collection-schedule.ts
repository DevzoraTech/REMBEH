import { computeLoanPricing } from '../loan-products/loan-pricing';

export type CollectionScheduleInput = {
  principalAmount: number;
  interestRatePercent: number;
  durationDays: number;
  processingFee: number;
  /** Remaining balance on the loan (total repayable − paid). */
  balance: number;
  /**
   * Sum of recorded repayment amounts. When provided, this is the source of
   * truth for paidAmount (0 until POST /collections/repayments). Prefer this
   * over deriving paid from totalRepayable − balance, which can mis-count fees
   * / interest when pricing inputs drift.
   */
  recordedPaidAmount?: number;
  /** Loan start used for daily schedule (disbursed/submitted/created). */
  startDate: Date;
  asOf?: Date;
};

export type CollectionSchedule = {
  principalAmount: number;
  interestAmount: number;
  processingFee: number;
  totalRepayable: number;
  paidAmount: number;
  outstanding: number;
  dailyInstalment: number;
  daysElapsed: number;
  daysLeft: number;
  loanPeriodDays: number;
  expectedCumulative: number;
  expectedToday: number;
  carriedForward: number;
  nextDueLabel: string;
  nextDueIsToday: boolean;
  loanStartDate: string;
  maturityDate: string;
};

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Equal daily instalment schedule over the loan term.
 * expectedToday = amount still owed for days elapsed so far (incl. arrears).
 */
export function computeCollectionSchedule(
  input: CollectionScheduleInput,
): CollectionSchedule {
  const pricing = computeLoanPricing({
    principalAmount: input.principalAmount,
    interestRatePercent: input.interestRatePercent,
    durationDays: Math.max(1, input.durationDays),
    processingFee: input.processingFee,
  });

  const totalRepayable = pricing.totalRepayable;
  const outstanding = roundMoney(Math.max(0, input.balance));
  const paidAmount =
    input.recordedPaidAmount != null
      ? roundMoney(Math.max(0, input.recordedPaidAmount))
      : roundMoney(Math.max(0, totalRepayable - outstanding));
  const periodDays = Math.max(1, pricing.durationDays);
  const dailyInstalment = roundMoney(totalRepayable / periodDays);

  const asOf = startOfDay(input.asOf ?? new Date());
  const start = startOfDay(input.startDate);
  const maturity = new Date(start);
  maturity.setDate(maturity.getDate() + periodDays);

  const msPerDay = 24 * 60 * 60 * 1000;
  const rawElapsed = Math.floor((asOf.getTime() - start.getTime()) / msPerDay) + 1;
  const daysElapsed = Math.min(periodDays, Math.max(1, rawElapsed));
  const daysLeft = Math.max(0, periodDays - daysElapsed + (asOf < maturity ? 1 : 0));
  const calendarDaysLeft = Math.max(
    0,
    Math.ceil((maturity.getTime() - asOf.getTime()) / msPerDay),
  );

  const expectedCumulative = roundMoney(
    Math.min(totalRepayable, dailyInstalment * daysElapsed),
  );
  const owedThroughToday = roundMoney(Math.max(0, expectedCumulative - paidAmount));
  const expectedToday = roundMoney(Math.min(outstanding, owedThroughToday));
  const carriedForward = roundMoney(
    Math.max(0, expectedToday - dailyInstalment),
  );

  const fullyPaid = outstanding <= 0;
  const nextDueIsToday = !fullyPaid && expectedToday > 0;
  let nextDueLabel = 'Paid up';
  if (!fullyPaid) {
    if (nextDueIsToday) {
      nextDueLabel = 'Due today';
    } else if (asOf >= maturity) {
      nextDueLabel = 'Overdue';
    } else {
      nextDueLabel = `Due in ${calendarDaysLeft} day${calendarDaysLeft === 1 ? '' : 's'}`;
    }
  }

  return {
    principalAmount: pricing.principalAmount,
    interestAmount: pricing.interestAmount,
    processingFee: pricing.processingFee,
    totalRepayable,
    paidAmount,
    outstanding,
    dailyInstalment,
    daysElapsed,
    daysLeft: calendarDaysLeft,
    loanPeriodDays: periodDays,
    expectedCumulative,
    expectedToday,
    carriedForward,
    nextDueLabel,
    nextDueIsToday,
    loanStartDate: start.toISOString(),
    maturityDate: maturity.toISOString(),
  };
}

/** Allocate a payment: fees → interest → principal. */
export function allocateRepayment(input: {
  amount: number;
  remainingFees: number;
  remainingInterest: number;
  remainingPrincipal: number;
}) {
  let left = roundMoney(input.amount);
  const feesAllocated = roundMoney(Math.min(left, Math.max(0, input.remainingFees)));
  left = roundMoney(left - feesAllocated);
  const interestAllocated = roundMoney(
    Math.min(left, Math.max(0, input.remainingInterest)),
  );
  left = roundMoney(left - interestAllocated);
  const principalAllocated = roundMoney(
    Math.min(left, Math.max(0, input.remainingPrincipal)),
  );

  return {
    feesAllocated,
    interestAllocated,
    principalAllocated,
    applied: roundMoney(feesAllocated + interestAllocated + principalAllocated),
  };
}
