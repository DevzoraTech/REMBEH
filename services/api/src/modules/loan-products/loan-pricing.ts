/**
 * Loan interest / repayable preview.
 *
 * FLAT:
 *   interest = principal × (rate% / 100)
 *
 * REDUCING_BALANCE / COMPOUND (interim until full amortization schedules):
 *   Same principal × rate% preview as FLAT so submit / snapshot stay stable.
 *   The interest type is stored on the template and application for later
 *   amortization work; duration still drives schedules/due dates elsewhere.
 *
 * repayable = principal + interest + processingFee
 */
export function computeLoanPricing(input: {
  principalAmount: number;
  interestRatePercent: number;
  durationDays: number;
  processingFee?: number | null;
  /** Stored on template; does not change interim math yet. */
  interestType?: string | null;
}) {
  const principal = roundMoney(input.principalAmount);
  const rate = input.interestRatePercent;
  const days = input.durationDays;
  const fee = roundMoney(input.processingFee ?? 0);
  // Interim: all interest types use flat principal×rate% for repayable preview.
  // REDUCING_BALANCE / COMPOUND remain stored for future amortization.
  void input.interestType;
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
