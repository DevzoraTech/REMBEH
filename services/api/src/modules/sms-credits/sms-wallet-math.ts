/**
 * Pure wallet transition helpers for concurrency / reconciliation unit tests.
 * Production path uses the same arithmetic inside SmsCreditsService transactions.
 */

export type WalletSnapshot = {
  availableUnits: number;
  reservedUnits: number;
  lifetimeUsed: number;
};

export function tryReserve(
  wallet: WalletSnapshot,
  units: number,
): { ok: true; next: WalletSnapshot } | { ok: false } {
  if (units < 1 || wallet.availableUnits < units) {
    return { ok: false };
  }
  return {
    ok: true,
    next: {
      ...wallet,
      availableUnits: wallet.availableUnits - units,
      reservedUnits: wallet.reservedUnits + units,
    },
  };
}

export function releaseReserve(
  wallet: WalletSnapshot,
  units: number,
): WalletSnapshot {
  return {
    ...wallet,
    availableUnits: wallet.availableUnits + units,
    reservedUnits: Math.max(0, wallet.reservedUnits - units),
  };
}

export function confirmDebit(
  wallet: WalletSnapshot,
  units: number,
): WalletSnapshot {
  return {
    ...wallet,
    reservedUnits: Math.max(0, wallet.reservedUnits - units),
    lifetimeUsed: wallet.lifetimeUsed + units,
  };
}

export function creditPurchase(
  wallet: WalletSnapshot,
  units: number,
): WalletSnapshot {
  return {
    ...wallet,
    availableUnits: wallet.availableUnits + units,
  };
}

/** available + reserved must equal opening + credits − confirmed debits. */
export function reconciles(input: {
  opening: number;
  credits: number;
  confirmedDebits: number;
  available: number;
  reserved: number;
}): boolean {
  return (
    input.available + input.reserved ===
    input.opening + input.credits - input.confirmedDebits
  );
}
