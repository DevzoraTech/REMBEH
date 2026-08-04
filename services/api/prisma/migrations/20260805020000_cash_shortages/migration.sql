-- CreateEnum
CREATE TYPE "CashShortageSource" AS ENUM ('AGENT_FLOAT_RETURN', 'BRANCH_CLOSE', 'MANUAL');

-- CreateEnum
CREATE TYPE "CashShortageStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'CLEARED');

-- CreateEnum
CREATE TYPE "CashShortagePaymentMethod" AS ENUM ('CASH', 'SALARY_DEDUCTION', 'OTHER');

-- CreateTable
CREATE TABLE "cash_shortages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "responsible_user_id" UUID NOT NULL,
    "source_type" "CashShortageSource" NOT NULL,
    "source_id" UUID,
    "operation_date" DATE NOT NULL,
    "amount_original" DECIMAL(18,2) NOT NULL,
    "amount_outstanding" DECIMAL(18,2) NOT NULL,
    "status" "CashShortageStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "cleared_at" TIMESTAMP(3),

    CONSTRAINT "cash_shortages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_shortage_payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "shortage_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "method" "CashShortagePaymentMethod" NOT NULL DEFAULT 'CASH',
    "notes" TEXT,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_shortage_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_shortages_tenant_id_branch_id_status_idx" ON "cash_shortages"("tenant_id", "branch_id", "status");

-- CreateIndex
CREATE INDEX "cash_shortages_tenant_id_responsible_user_id_status_idx" ON "cash_shortages"("tenant_id", "responsible_user_id", "status");

-- CreateIndex
CREATE INDEX "cash_shortages_tenant_id_operation_date_idx" ON "cash_shortages"("tenant_id", "operation_date");

-- CreateIndex
CREATE INDEX "cash_shortages_source_type_source_id_idx" ON "cash_shortages"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "cash_shortage_payments_shortage_id_paid_at_idx" ON "cash_shortage_payments"("shortage_id", "paid_at");

-- CreateIndex
CREATE INDEX "cash_shortage_payments_tenant_id_paid_at_idx" ON "cash_shortage_payments"("tenant_id", "paid_at");

-- AddForeignKey
ALTER TABLE "cash_shortages" ADD CONSTRAINT "cash_shortages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_shortages" ADD CONSTRAINT "cash_shortages_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_shortages" ADD CONSTRAINT "cash_shortages_responsible_user_id_fkey" FOREIGN KEY ("responsible_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_shortages" ADD CONSTRAINT "cash_shortages_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_shortage_payments" ADD CONSTRAINT "cash_shortage_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_shortage_payments" ADD CONSTRAINT "cash_shortage_payments_shortage_id_fkey" FOREIGN KEY ("shortage_id") REFERENCES "cash_shortages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_shortage_payments" ADD CONSTRAINT "cash_shortage_payments_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
