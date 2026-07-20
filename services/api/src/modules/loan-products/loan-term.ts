import { LoanTermUnit } from '@prisma/client';

/** Convert template term to duration days used by schedule / fines / pricing. */
export function termToDurationDays(
  termValue: number,
  termUnit: LoanTermUnit | string,
): number {
  const value = Math.floor(termValue);
  if (!Number.isFinite(value) || value < 1) {
    return 0;
  }
  switch (termUnit) {
    case LoanTermUnit.DAYS:
    case 'DAYS':
      return value;
    case LoanTermUnit.MONTHS:
    case 'MONTHS':
      return value * 30;
    case LoanTermUnit.YEARS:
    case 'YEARS':
      return value * 365;
    default:
      return value;
  }
}

export function describeLoanTerm(
  termValue: number,
  termUnit: LoanTermUnit | string,
): string {
  const unit =
    termUnit === 'MONTHS' || termUnit === LoanTermUnit.MONTHS
      ? termValue === 1
        ? 'month'
        : 'months'
      : termUnit === 'YEARS' || termUnit === LoanTermUnit.YEARS
        ? termValue === 1
          ? 'year'
          : 'years'
        : termValue === 1
          ? 'day'
          : 'days';
  return `${termValue} ${unit}`;
}

/** Fine amount = penaltyRatePercent of original principal (rounded to 2dp). */
export function computePenaltyFineAmount(input: {
  principalAmount: number;
  penaltyRatePercent: number;
}): number {
  const principal = Number(input.principalAmount);
  const rate = Number(input.penaltyRatePercent);
  if (!Number.isFinite(principal) || principal <= 0) return 0;
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return Math.round(principal * (rate / 100) * 100) / 100;
}

export function computeProcessingFeeAmount(input: {
  principalAmount: number;
  processingFeePercent: number;
}): number {
  const principal = Number(input.principalAmount);
  const rate = Number(input.processingFeePercent);
  if (!Number.isFinite(principal) || principal <= 0) return 0;
  if (!Number.isFinite(rate) || rate < 0) return 0;
  return Math.round(principal * (rate / 100) * 100) / 100;
}
