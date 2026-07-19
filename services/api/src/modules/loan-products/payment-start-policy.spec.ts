import { PaymentStartPolicyType } from '@prisma/client';
import { computePaymentStartDate } from './payment-start-policy';

describe('payment-start-policy', () => {
  const anchor = new Date(2026, 6, 19, 15, 30, 0); // 19 Jul 2026 local

  it('SAME_DAY uses the anchor calendar day', () => {
    const result = computePaymentStartDate({
      policyType: PaymentStartPolicyType.SAME_DAY,
      anchorDate: anchor,
    });
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(6);
    expect(result.getDate()).toBe(19);
  });

  it('NEXT_DAY is the following calendar day', () => {
    const result = computePaymentStartDate({
      policyType: PaymentStartPolicyType.NEXT_DAY,
      anchorDate: anchor,
    });
    expect(result.getDate()).toBe(20);
  });

  it('AFTER_N_DAYS offsets by n', () => {
    const result = computePaymentStartDate({
      policyType: PaymentStartPolicyType.AFTER_N_DAYS,
      afterDays: 3,
      anchorDate: anchor,
    });
    expect(result.getDate()).toBe(22);
  });

  it('allows agent pick on or after policy date', () => {
    const result = computePaymentStartDate({
      policyType: PaymentStartPolicyType.NEXT_DAY,
      allowAgentDatePick: true,
      anchorDate: anchor,
      agentPickedDate: new Date(2026, 6, 25),
    });
    expect(result.getDate()).toBe(25);
  });

  it('rejects agent pick earlier than policy', () => {
    expect(() =>
      computePaymentStartDate({
        policyType: PaymentStartPolicyType.NEXT_DAY,
        allowAgentDatePick: true,
        anchorDate: anchor,
        agentPickedDate: new Date(2026, 6, 19),
      }),
    ).toThrow(/earlier than the branch policy/);
  });
});
