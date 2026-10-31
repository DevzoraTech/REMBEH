import { Prisma } from '@prisma/client';

/** Values supplied by the branch, not estimates of individual transactions. */
export interface OpeningPositionInput {
  repayable: string;
  outstanding: string;
  principal?: string;
  flatInterestPercent?: string;
}

const moneyPattern = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;
const percentPattern = /^(?:0|[1-9]\d{0,3})(?:\.\d{1,4})?$/;

function parseAmount(value: string, label: string): Prisma.Decimal {
  if (!moneyPattern.test(value))
    throw new Error(
      `${label} must be a non-negative amount with at most two decimal places.`,
    );
  return new Prisma.Decimal(value);
}

/** Validates the opening obligation without inventing historical payments. */
export function calculateOpeningPosition(input: OpeningPositionInput) {
  const repayable = parseAmount(input.repayable, 'Repayable amount');
  const outstanding = parseAmount(input.outstanding, 'Outstanding balance');
  if (repayable.lte(0))
    throw new Error('Repayable amount must be greater than zero.');
  if (outstanding.gt(repayable))
    throw new Error('Outstanding balance cannot exceed the repayable amount.');

  let principal =
    input.principal === undefined
      ? null
      : parseAmount(input.principal, 'Principal');
  if (principal && (principal.lte(0) || principal.gt(repayable))) {
    throw new Error(
      'Principal must be greater than zero and no more than the repayable amount.',
    );
  }
  if (input.flatInterestPercent !== undefined) {
    if (!percentPattern.test(input.flatInterestPercent))
      throw new Error('Invalid flat interest percentage.');
    const rate = new Prisma.Decimal(input.flatInterestPercent);
    if (rate.gt(1000))
      throw new Error('Flat interest percentage cannot exceed 1000.');
    const derived = repayable
      .div(new Prisma.Decimal(1).plus(rate.div(100)))
      .toDecimalPlaces(2);
    if (principal && principal.sub(derived).abs().gt('0.01')) {
      throw new Error(
        'Principal, flat interest and repayable amount do not agree.',
      );
    }
    principal ??= derived;
  }
  return {
    repayable,
    outstanding,
    principal,
    alreadyPaid: repayable.sub(outstanding),
    closed: outstanding.isZero(),
  };
}
