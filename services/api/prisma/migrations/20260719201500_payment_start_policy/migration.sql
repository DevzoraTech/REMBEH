-- CreateEnum
CREATE TYPE "PaymentStartPolicyType" AS ENUM ('SAME_DAY', 'NEXT_DAY', 'AFTER_N_DAYS');

-- CreateTable
CREATE TABLE "loan_payment_start_policies" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "policy_type" "PaymentStartPolicyType" NOT NULL,
    "after_days" INTEGER,
    "allow_agent_date_pick" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_payment_start_policies_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "loans" ADD COLUMN "payment_start_date" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "loan_applications" ADD COLUMN "payment_start_date" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "loan_payment_start_policies_tenant_id_branch_id_is_active_idx" ON "loan_payment_start_policies"("tenant_id", "branch_id", "is_active");

-- CreateIndex
CREATE INDEX "loan_payment_start_policies_tenant_id_is_active_idx" ON "loan_payment_start_policies"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "loans_tenant_id_payment_start_date_idx" ON "loans"("tenant_id", "payment_start_date");

-- AddForeignKey
ALTER TABLE "loan_payment_start_policies" ADD CONSTRAINT "loan_payment_start_policies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "loan_payment_start_policies" ADD CONSTRAINT "loan_payment_start_policies_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One active tenant-wide policy per tenant (branch_id IS NULL)
CREATE UNIQUE INDEX "loan_payment_start_policies_tenant_wide_active_uidx"
  ON "loan_payment_start_policies"("tenant_id")
  WHERE "branch_id" IS NULL AND "is_active" = true;

-- One active branch policy per branch
CREATE UNIQUE INDEX "loan_payment_start_policies_branch_active_uidx"
  ON "loan_payment_start_policies"("tenant_id", "branch_id")
  WHERE "branch_id" IS NOT NULL AND "is_active" = true;
