/**
 * Flat percent interest on principal (no duration factor):
 * loanRate = principal × (rate% / 100)
 * repayable = principal + loanRate + processingFee
 *
 * Duration/period is still used for payment schedules and due dates elsewhere,
 * but not for the interest amount. New loans snapshot totalRepayable onto the
 * wallet opening balance / loan balance at submit; those stored values stay as
 * stored even if this formula changes later.
 */
export function computeLoanPricing(input: {
  principalAmount: number;
  interestRatePercent: number;
  durationDays: number;
  processingFee?: number | null;
}) {
  const principal = roundMoney(input.principalAmount);
  const rate = input.interestRatePercent;
  const days = input.durationDays;
  const fee = roundMoney(input.processingFee ?? 0);
  const interestAmount = roundMoney(principal * (rate / 100));
  const totalRepayable = roundMoney(principal + interestAmount + fee);

  return {
    principalAmount: principal,
    interestRatePercent: rate,
    durationDays: days,
    processingFee: fee,
    interestAmount,
    totalRepayable,
  };
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
