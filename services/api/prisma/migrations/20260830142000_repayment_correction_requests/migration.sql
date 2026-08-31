CREATE TYPE "RepaymentCorrectionRequestStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED'
);

CREATE TABLE "repayment_correction_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "repayment_id" UUID NOT NULL,
  "loan_id" UUID NOT NULL,
  "requested_by_user_id" UUID NOT NULL,
  "reviewed_by_user_id" UUID,
  "correction_applied_by_user_id" UUID,
  "status" "RepaymentCorrectionRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT NOT NULL,
  "requested_amount" DECIMAL(18, 2),
  "requested_method" "RepaymentMethod",
  "requested_paid_at" TIMESTAMP(3),
  "requested_note" TEXT,
  "officer_can_edit" BOOLEAN NOT NULL DEFAULT false,
  "reviewer_feedback" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "correction_applied_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "repayment_correction_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "repayment_correction_requests_tenant_id_branch_id_status_created_at_idx"
  ON "repayment_correction_requests"("tenant_id", "branch_id", "status", "created_at");

CREATE INDEX "repayment_correction_requests_tenant_id_requested_by_user_id_status_created_at_idx"
  ON "repayment_correction_requests"("tenant_id", "requested_by_user_id", "status", "created_at");

CREATE INDEX "repayment_correction_requests_correction_applied_by_user_id_idx"
  ON "repayment_correction_requests"("correction_applied_by_user_id");

CREATE INDEX "repayment_correction_requests_loan_id_created_at_idx"
  ON "repayment_correction_requests"("loan_id", "created_at");

ALTER TABLE "repayment_correction_requests"
  ADD CONSTRAINT "repayment_correction_requests_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "repayment_correction_requests"
  ADD CONSTRAINT "repayment_correction_requests_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "repayment_correction_requests"
  ADD CONSTRAINT "repayment_correction_requests_repayment_id_fkey"
  FOREIGN KEY ("repayment_id") REFERENCES "repayments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "repayment_correction_requests"
  ADD CONSTRAINT "repayment_correction_requests_loan_id_fkey"
  FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "repayment_correction_requests"
  ADD CONSTRAINT "repayment_correction_requests_requested_by_user_id_fkey"
  FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "repayment_correction_requests"
  ADD CONSTRAINT "repayment_correction_requests_reviewed_by_user_id_fkey"
  FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "repayment_correction_requests"
  ADD CONSTRAINT "repayment_correction_requests_correction_applied_by_user_id_fkey"
  FOREIGN KEY ("correction_applied_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
