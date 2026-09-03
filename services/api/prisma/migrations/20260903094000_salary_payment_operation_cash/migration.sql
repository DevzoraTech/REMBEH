-- Salary paid from the open branch day is recorded against that day's cash.

ALTER TABLE "salary_payments"
ADD COLUMN "operation_id" UUID;

CREATE INDEX "salary_payments_operation_id_reversed_at_idx"
ON "salary_payments"("operation_id", "reversed_at");

ALTER TABLE "salary_payments"
ADD CONSTRAINT "salary_payments_operation_id_fkey"
FOREIGN KEY ("operation_id") REFERENCES "branch_daily_operations"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
