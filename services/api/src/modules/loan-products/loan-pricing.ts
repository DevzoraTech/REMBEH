/**
 * Loan interest / repayable preview.
 *
 * FLAT:
 *   interest = principal × (rate% / 100)
 *
 * REDUCING_BALANCE / COMPOUND:
 *   Interim implementation continues to use principal × rate%
 *   until full amortization schedules are implemented.
 *
 * IMPORTANT ACCOUNTING RULE
 * -------------------------
 * Processing fee is operational fee income collected separately.
 * It is NOT part of the borrower's loan debt.
 *
 * Loan repayable:
 *   principal + interest
 *
 * Processing fee:
 *   tracked separately as fee income
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
  const rate = Number(input.interestRatePercent) || 0;
  const days = Math.max(0, Number(input.durationDays) || 0);
  const fee = roundMoney(input.processingFee ?? 0);

  /*
   * Interim:
   * all interest types still use flat principal × rate%.
   *
   * REDUCING_BALANCE / COMPOUND remain persisted so proper
   * amortization can be introduced later without changing the
   * application/template contract.
   */
  void input.interestType;

  const interestAmount = roundMoney(
    principal * (rate / 100),
  );

  /*
   * Processing fee MUST NOT be included here.
   *
   * It is received separately as branch fee income and therefore
   * does not increase:
   * - loan balance
   * - opening wallet balance
   * - daily instalment
   * - outstanding loan amount
   */
  const totalRepayable = roundMoney(
    principal + interestAmount,
  );

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
  return Math.round(
    (Number(value || 0) + Number.EPSILON) * 100,
  ) / 100;
}

/**
 * Resolve the contractual base repayable used by repayment schedules.
 *
 * Current rule:
 *   principal + interest
 *
 * Processing fee is excluded.
 *
 * Existing installations may still contain wallet opening balances from
 * the former formula:
 *
 *   principal + interest + processingFee
 *
 * Callers should pass the newly calculated `pricedTotal`. If the stored
 * opening balance appears to be an obsolete principal-only / annualized
 * value, pricing becomes the authoritative value.
 *
 * Fee-inclusive historical wallet snapshots should ultimately be migrated
 * in the database as well; this helper is not a substitute for correcting
 * persisted balances.
 */
export function resolveBaseRepayable(input: {
  openingBalance: number | null | undefined;
  pricedTotal: number;
  principal: number;
  paidAmount?: number;
  balance?: number;
  finesTotal?: number;
}) {
  const priced = roundMoney(
    Math.max(0, input.pricedTotal),
  );

  if (input.openingBalance == null) {
    /*
     * When there is no contractual opening snapshot, reconstruct only
     * when enough runtime information exists.
     *
     * balance + paid - fines gives the original base debt.
     */
    const balance = Math.max(
      0,
      Number(input.balance ?? 0),
    );

    const paid = Math.max(
      0,
      Number(input.paidAmount ?? 0),
    );

    const fines = Math.max(
      0,
      Number(input.finesTotal ?? 0),
    );

    const reconstructed = roundMoney(
      Math.max(
        0,
        balance + paid - fines,
      ),
    );

    /*
     * Prefer current contractual pricing when reconstruction gives
     * no meaningful historical value.
     */
    return reconstructed > 0
      ? reconstructed
      : priced;
  }

  const opening = roundMoney(
    Math.max(0, input.openingBalance),
  );

  if (Math.abs(opening - priced) < 1) {
    return opening;
  }

  /*
   * Historical principal-only snapshots.
   */
  const principalOnly =
    Math.abs(
      opening - roundMoney(input.principal),
    ) < 1;

  /*
   * Historical annualized-interest snapshots were normally between
   * principal and the correct flat contractual total.
   */
  const legacyAnnualized =
    !principalOnly &&
    opening + 1 < priced &&
    opening > input.principal;

  if (
    principalOnly ||
    legacyAnnualized
  ) {
    return priced;
  }

  /*
   * Preserve other historical snapshots rather than silently rewriting
   * contractual data in memory. The database migration handles known
   * processing-fee-inclusive balances explicitly.
   */
  return opening;
}