-- Overdue fine policy (manager-configurable) + applied fine history.

CREATE TABLE "loan_fine_policies" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "fine_period_days" INTEGER NOT NULL,
    "fine_amount" DECIMAL(18,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_fine_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "loan_fines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "loan_id" UUID NOT NULL,
    "period_index" INTEGER NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_fines_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "loans"
ADD COLUMN "is_fined" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "fines_total" DECIMAL(18,2) NOT NULL DEFAULT 0;

ALTER TABLE "client_wallets"
ADD COLUMN "is_fined" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "fines_total" DECIMAL(18,2) NOT NULL DEFAULT 0;

CREATE INDEX "loan_fine_policies_tenant_id_branch_id_is_active_idx" ON "loan_fine_policies"("tenant_id", "branch_id", "is_active");
CREATE INDEX "loan_fine_policies_tenant_id_is_active_idx" ON "loan_fine_policies"("tenant_id", "is_active");

CREATE UNIQUE INDEX "loan_fines_loan_id_period_index_key" ON "loan_fines"("loan_id", "period_index");
CREATE INDEX "loan_fines_tenant_id_loan_id_idx" ON "loan_fines"("tenant_id", "loan_id");
CREATE INDEX "loan_fines_tenant_id_applied_at_idx" ON "loan_fines"("tenant_id", "applied_at");

CREATE INDEX "loans_tenant_id_is_fined_idx" ON "loans"("tenant_id", "is_fined");

ALTER TABLE "loan_fine_policies" ADD CONSTRAINT "loan_fine_policies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loan_fine_policies" ADD CONSTRAINT "loan_fine_policies_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "loan_fines" ADD CONSTRAINT "loan_fines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loan_fines" ADD CONSTRAINT "loan_fines_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loan_fines" ADD CONSTRAINT "loan_fines_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
