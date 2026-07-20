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
    case LoanTermUnit.WEEKS:
    case 'WEEKS':
      return value * 7;
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
  if (termUnit === 'WEEKS' || termUnit === LoanTermUnit.WEEKS) {
    return `${termValue} ${termValue === 1 ? 'week' : 'weeks'}`;
  }
  if (termUnit === 'MONTHS' || termUnit === LoanTermUnit.MONTHS) {
    return `${termValue} ${termValue === 1 ? 'month' : 'months'}`;
  }
  if (termUnit === 'YEARS' || termUnit === LoanTermUnit.YEARS) {
    return `${termValue} ${termValue === 1 ? 'year' : 'years'}`;
  }
  return `${termValue} ${termValue === 1 ? 'day' : 'days'}`;
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
