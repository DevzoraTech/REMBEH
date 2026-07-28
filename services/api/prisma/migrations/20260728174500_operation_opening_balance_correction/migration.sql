-- Correct Daily Operations opening cash model:
-- opening balance comes from the previous closing balance, then today's added
-- cash is added on top. Float assignments reduce the available branch cash.
ALTER TABLE "branch_daily_operations"
  ADD COLUMN "cash_added_today" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "closing_balance" DECIMAL(18,2);

UPDATE "branch_daily_operations"
SET
  "cash_added_today" = "cash_in_vault" + "cash_in_safe",
  "opening_float_available" = "previous_closing_balance" + "cash_in_vault" + "cash_in_safe"
WHERE "cash_added_today" = 0;
