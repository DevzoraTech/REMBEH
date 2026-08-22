CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

CREATE TYPE "SalaryPaymentMethod" AS ENUM ('CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'OTHER');

CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "user_id" UUID,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "nin_number" TEXT,
    "role_name" TEXT,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "monthly_salary" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "date_joined" DATE NOT NULL,
    "payment_method" "SalaryPaymentMethod",
    "payment_provider" TEXT,
    "payment_account_name" TEXT,
    "payment_account_number" TEXT,
    "notes" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "salary_payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "employee_id" UUID NOT NULL,
    "cycle_start" DATE NOT NULL,
    "cycle_end" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "method" "SalaryPaymentMethod" NOT NULL DEFAULT 'CASH',
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference_note" TEXT,
    "recorded_by_user_id" UUID NOT NULL,
    "reversed_at" TIMESTAMP(3),
    "reversal_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employees_tenant_id_user_id_key" ON "employees"("tenant_id", "user_id");
CREATE UNIQUE INDEX "employees_user_id_key" ON "employees"("user_id");
CREATE INDEX "employees_tenant_id_branch_id_status_idx" ON "employees"("tenant_id", "branch_id", "status");
CREATE INDEX "employees_tenant_id_full_name_idx" ON "employees"("tenant_id", "full_name");
CREATE INDEX "salary_payments_tenant_id_branch_id_cycle_start_idx" ON "salary_payments"("tenant_id", "branch_id", "cycle_start");
CREATE INDEX "salary_payments_employee_id_cycle_start_idx" ON "salary_payments"("employee_id", "cycle_start");
CREATE INDEX "salary_payments_tenant_id_paid_at_idx" ON "salary_payments"("tenant_id", "paid_at");

ALTER TABLE "employees" ADD CONSTRAINT "employees_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
