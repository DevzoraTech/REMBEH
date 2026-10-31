CREATE TABLE "borrower_onboarding_setups" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "selected_fields" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "borrower_onboarding_setups_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "borrower_onboarding_setups_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "borrower_onboarding_setups_branch_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "borrower_onboarding_setups_branch_id_key" ON "borrower_onboarding_setups"("branch_id");
CREATE INDEX "borrower_onboarding_setups_tenant_id_branch_id_idx" ON "borrower_onboarding_setups"("tenant_id", "branch_id");
