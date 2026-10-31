CREATE TABLE "borrower_onboarding_receipts" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "request_id" UUID NOT NULL,
  "request_hash" TEXT NOT NULL,
  "customer_id" UUID NOT NULL,
  "loan_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "borrower_onboarding_receipts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "borrower_onboarding_receipts_tenant_id_branch_id_request_id_key"
  ON "borrower_onboarding_receipts"("tenant_id", "branch_id", "request_id");
