import {
  confirmDebit,
  creditPurchase,
  reconciles,
  releaseReserve,
  tryReserve,
} from './sms-wallet-math';

describe('sms wallet math', () => {
  it('blocks reserve when available is 0', () => {
    const result = tryReserve(
      { availableUnits: 0, reservedUnits: 0, lifetimeUsed: 0 },
      1,
    );
    expect(result.ok).toBe(false);
  });

  it('reserves 2 units for a 2-segment message', () => {
    const result = tryReserve(
      { availableUnits: 5, reservedUnits: 0, lifetimeUsed: 0 },
      2,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.next.availableUnits).toBe(3);
    expect(result.next.reservedUnits).toBe(2);
  });

  it('releases reserve on provider failure', () => {
    const reserved = tryReserve(
      { availableUnits: 4, reservedUnits: 0, lifetimeUsed: 0 },
      2,
    );
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const released = releaseReserve(reserved.next, 2);
    expect(released.availableUnits).toBe(4);
    expect(released.reservedUnits).toBe(0);
  });

  it('confirms debit without restoring available', () => {
    const reserved = tryReserve(
      { availableUnits: 3, reservedUnits: 0, lifetimeUsed: 0 },
      1,
    );
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const settled = confirmDebit(reserved.next, 1);
    expect(settled.availableUnits).toBe(2);
    expect(settled.reservedUnits).toBe(0);
    expect(settled.lifetimeUsed).toBe(1);
  });

  it('cannot overdraw under concurrent reserves', () => {
    let wallet = { availableUnits: 3, reservedUnits: 0, lifetimeUsed: 0 };
    const first = tryReserve(wallet, 2);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    wallet = first.next;
    const second = tryReserve(wallet, 2);
    expect(second.ok).toBe(false);
    const third = tryReserve(wallet, 1);
    expect(third.ok).toBe(true);
  });

  it('credits once and reconciles ledger identity', () => {
    let wallet = { availableUnits: 10, reservedUnits: 0, lifetimeUsed: 0 };
    wallet = creditPurchase(wallet, 222);
    const reserved = tryReserve(wallet, 2);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    wallet = confirmDebit(reserved.next, 2);
    expect(
      reconciles({
        opening: 10,
        credits: 222,
        confirmedDebits: 2,
        available: wallet.availableUnits,
        reserved: wallet.reservedUnits,
      }),
    ).toBe(true);
  });
});
