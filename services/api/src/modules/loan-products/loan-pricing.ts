/**
 * Simple annualized interest for the loan term:
 * interest = principal × (rate% / 100) × (durationDays / 365)
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
  const interestAmount = roundMoney(principal * (rate / 100) * (days / 365));
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
