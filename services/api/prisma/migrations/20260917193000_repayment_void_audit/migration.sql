ALTER TABLE "repayments"
  ADD COLUMN "voided_at" TIMESTAMP(3),
  ADD COLUMN "voided_by_user_id" UUID,
  ADD COLUMN "void_reason" TEXT;

CREATE INDEX "repayments_tenant_id_branch_id_voided_at_idx"
  ON "repayments"("tenant_id", "branch_id", "voided_at");
