-- CreateEnum
CREATE TYPE "RepaymentMethod" AS ENUM ('CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'OTHER');

-- CreateTable
CREATE TABLE "repayments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "loan_id" UUID NOT NULL,
    "recorded_by_user_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "principal_allocated" DECIMAL(18,2) NOT NULL,
    "interest_allocated" DECIMAL(18,2) NOT NULL,
    "fees_allocated" DECIMAL(18,2) NOT NULL,
    "method" "RepaymentMethod" NOT NULL DEFAULT 'CASH',
    "paid_at" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "receipt_number" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repayments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "repayments_tenant_id_paid_at_idx" ON "repayments"("tenant_id", "paid_at");

-- CreateIndex
CREATE INDEX "repayments_tenant_id_branch_id_paid_at_idx" ON "repayments"("tenant_id", "branch_id", "paid_at");

-- CreateIndex
CREATE INDEX "repayments_tenant_id_loan_id_idx" ON "repayments"("tenant_id", "loan_id");

-- CreateIndex
CREATE INDEX "repayments_tenant_id_recorded_by_user_id_idx" ON "repayments"("tenant_id", "recorded_by_user_id");

-- AddForeignKey
ALTER TABLE "repayments" ADD CONSTRAINT "repayments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repayments" ADD CONSTRAINT "repayments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repayments" ADD CONSTRAINT "repayments_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repayments" ADD CONSTRAINT "repayments_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
