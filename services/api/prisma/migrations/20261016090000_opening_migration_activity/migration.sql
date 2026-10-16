-- Historical opening-register imports establish starting client positions.
-- They must not be counted as lending or collections on the day they were
-- loaded into REMBEH.
ALTER TABLE "loan_applications"
  ADD COLUMN IF NOT EXISTS "is_opening_migration" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "loan_disbursements"
  ADD COLUMN IF NOT EXISTS "is_opening_migration" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "repayments"
  ADD COLUMN IF NOT EXISTS "is_opening_migration" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "loan_applications_branch_opening_migration_submitted_at_idx"
  ON "loan_applications" ("branch_id", "is_opening_migration", "submitted_at");

CREATE INDEX IF NOT EXISTS "loan_disbursements_branch_opening_migration_disbursed_at_idx"
  ON "loan_disbursements" ("branch_id", "is_opening_migration", "disbursed_at");

CREATE INDEX IF NOT EXISTS "repayments_branch_opening_migration_paid_at_idx"
  ON "repayments" ("branch_id", "is_opening_migration", "paid_at");

-- Existing imports use stable local-id prefixes. Mark them once, preserving
-- the original source dates and every customer's actual outstanding balance.
UPDATE "loan_applications"
SET "is_opening_migration" = true
WHERE "local_id" LIKE '%-opening-app-%';

UPDATE "loan_disbursements"
SET "is_opening_migration" = true
WHERE "local_id" LIKE '%-opening-disbursement-%';

UPDATE "repayments"
SET "is_opening_migration" = true
WHERE "local_id" LIKE '%-opening-repayment-%';
