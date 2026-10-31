CREATE TABLE "borrower_onboarding_uploads" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "loan_id" UUID NOT NULL,
  "application_id" UUID NOT NULL,
  "media_type" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "file_name" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "confirmed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "borrower_onboarding_uploads_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "borrower_onboarding_uploads_storage_key_key" ON "borrower_onboarding_uploads"("storage_key");
CREATE INDEX "borrower_onboarding_uploads_tenant_id_branch_id_loan_id_idx" ON "borrower_onboarding_uploads"("tenant_id", "branch_id", "loan_id");
