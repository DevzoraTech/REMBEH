-- Field float must have a real daily set-aside limit.
ALTER TABLE "branch_daily_operations"
  ADD COLUMN "float_set_aside" DECIMAL(18,2) NOT NULL DEFAULT 0;

UPDATE "branch_daily_operations"
SET "float_set_aside" = "opening_float_available"
WHERE "float_set_aside" = 0;
