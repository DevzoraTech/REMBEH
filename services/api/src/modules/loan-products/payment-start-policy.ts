import { BadRequestException } from '@nestjs/common';
import { PaymentStartPolicyType } from '@prisma/client';

export type PaymentStartPolicyInput = {
  policyType: PaymentStartPolicyType;
  afterDays?: number | null;
  allowAgentDatePick?: boolean;
  /** Loan go-live: disbursedAt ?? approvedAt ?? submittedAt. */
  anchorDate: Date;
  /** Optional agent override when allowAgentDatePick is true. */
  agentPickedDate?: Date | null;
};

export const DEFAULT_PAYMENT_START_POLICY: {
  policyType: PaymentStartPolicyType;
  afterDays: number | null;
  allowAgentDatePick: boolean;
} = {
  policyType: PaymentStartPolicyType.NEXT_DAY,
  afterDays: null,
  allowAgentDatePick: false,
};

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

/**
 * Compute the calendar day when daily repayments start.
 *
 * Product rule: policy applies to the loan go-live anchor
 * (disbursement / approval / application submit — first available).
 */
export function computePaymentStartDate(input: PaymentStartPolicyInput): Date {
  const anchor = startOfDay(input.anchorDate);
  const policyDate = policyDateFromAnchor(
    input.policyType,
    input.afterDays,
    anchor,
  );

  if (!input.allowAgentDatePick || !input.agentPickedDate) {
    return policyDate;
  }

  const picked = startOfDay(input.agentPickedDate);
  if (Number.isNaN(picked.getTime())) {
    throw new BadRequestException('Invalid payment start date.');
  }
  if (picked.getTime() < policyDate.getTime()) {
    throw new BadRequestException(
      'Payment start date cannot be earlier than the branch policy allows.',
    );
  }
  return picked;
}

function policyDateFromAnchor(
  policyType: PaymentStartPolicyType,
  afterDays: number | null | undefined,
  anchor: Date,
): Date {
  const date = new Date(anchor);
  switch (policyType) {
    case PaymentStartPolicyType.SAME_DAY:
      return date;
    case PaymentStartPolicyType.NEXT_DAY:
      date.setDate(date.getDate() + 1);
      return date;
    case PaymentStartPolicyType.AFTER_N_DAYS: {
      const n = afterDays ?? 1;
      if (!Number.isInteger(n) || n < 1) {
        throw new BadRequestException(
          'afterDays must be a positive integer for AFTER_N_DAYS.',
        );
      }
      date.setDate(date.getDate() + n);
      return date;
    }
    default:
      date.setDate(date.getDate() + 1);
      return date;
  }
}

export function describePaymentStartPolicy(input: {
  policyType: PaymentStartPolicyType;
  afterDays?: number | null;
  allowAgentDatePick?: boolean;
}): string {
  const pick = input.allowAgentDatePick ? ' Agents may pick a later date.' : '';
  switch (input.policyType) {
    case PaymentStartPolicyType.SAME_DAY:
      return `Repayments start the same day as loan go-live.${pick}`;
    case PaymentStartPolicyType.NEXT_DAY:
      return `Repayments start the day after loan go-live.${pick}`;
    case PaymentStartPolicyType.AFTER_N_DAYS:
      return `Repayments start ${input.afterDays ?? 1} day(s) after loan go-live.${pick}`;
    default:
      return `Repayments start the day after loan go-live.${pick}`;
  }
}
