-- Prior-system shortages can sit on an employee without a login.
-- Cash recoveries attach to the open branch day as income.

ALTER TABLE "cash_shortages"
ALTER COLUMN "responsible_user_id" DROP NOT NULL;

ALTER TABLE "cash_shortages"
ADD COLUMN "employee_id" UUID;

CREATE INDEX "cash_shortages_tenant_id_employee_id_status_idx"
ON "cash_shortages"("tenant_id", "employee_id", "status");

ALTER TABLE "cash_shortages"
ADD CONSTRAINT "cash_shortages_employee_id_fkey"
FOREIGN KEY ("employee_id") REFERENCES "employees"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cash_shortage_payments"
ADD COLUMN "operation_id" UUID;

CREATE INDEX "cash_shortage_payments_operation_id_idx"
ON "cash_shortage_payments"("operation_id");

ALTER TABLE "cash_shortage_payments"
ADD CONSTRAINT "cash_shortage_payments_operation_id_fkey"
FOREIGN KEY ("operation_id") REFERENCES "branch_daily_operations"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
