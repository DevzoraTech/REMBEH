-- Extend loan product template enums: interest types, weeks term unit, lump-sum frequency.

ALTER TYPE "LoanInterestType" ADD VALUE 'REDUCING_BALANCE';
ALTER TYPE "LoanInterestType" ADD VALUE 'COMPOUND';

ALTER TYPE "LoanTermUnit" ADD VALUE 'WEEKS';

ALTER TYPE "LoanRepaymentFrequency" ADD VALUE 'LUMP_SUM';
