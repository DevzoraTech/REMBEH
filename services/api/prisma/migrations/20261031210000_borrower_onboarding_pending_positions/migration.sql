ALTER TABLE "borrower_onboarding_receipts" ALTER COLUMN "loan_id" DROP NOT NULL;

CREATE TABLE "borrower_onboarding_pending_positions" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "request_id" UUID NOT NULL,
  "issue_date" DATE NOT NULL,
  "repayable" DECIMAL(18,2) NOT NULL,
  "outstanding" DECIMAL(18,2) NOT NULL,
  "details" JSONB NOT NULL,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "borrower_onboarding_pending_positions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "borrower_onboarding_pending_positions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "borrower_onboarding_pending_positions_amounts_check" CHECK ("repayable" > 0 AND "outstanding" >= 0 AND "outstanding" <= "repayable")
);
CREATE UNIQUE INDEX "borrower_onboarding_pending_positions_customer_id_key" ON "borrower_onboarding_pending_positions"("customer_id");
CREATE UNIQUE INDEX "borrower_onboarding_pending_positions_tenant_id_branch_id_request_id_key" ON "borrower_onboarding_pending_positions"("tenant_id", "branch_id", "request_id");
CREATE INDEX "borrower_onboarding_pending_positions_tenant_id_branch_id_completed_at_idx" ON "borrower_onboarding_pending_positions"("tenant_id", "branch_id", "completed_at");

CREATE TABLE "borrower_onboarding_pending_media" (
  "id" UUID NOT NULL,
  "pending_id" UUID NOT NULL,
  "media_type" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "file_name" TEXT,
  CONSTRAINT "borrower_onboarding_pending_media_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "borrower_onboarding_pending_media_pending_id_fkey" FOREIGN KEY ("pending_id") REFERENCES "borrower_onboarding_pending_positions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "borrower_onboarding_pending_media_pending_id_media_type_key" ON "borrower_onboarding_pending_media"("pending_id", "media_type");
