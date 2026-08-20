-- CreateTable
CREATE TABLE "branch_operation_reconciliations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "operation_id" UUID NOT NULL,
    "counted_cash" DECIMAL(18,2),
    "notes" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_operation_reconciliations_pkey"
        PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_operation_cash_counts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "reconciliation_id" UUID NOT NULL,
    "previous_amount" DECIMAL(18,2),
    "counted_amount" DECIMAL(18,2) NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by_user_id" UUID NOT NULL,

    CONSTRAINT "branch_operation_cash_counts_pkey"
        PRIMARY KEY ("id")
);

-- One reconciliation per branch daily operation
CREATE UNIQUE INDEX
    "branch_operation_reconciliations_operation_id_key"
ON "branch_operation_reconciliations"("operation_id");

-- Reconciliation indexes
CREATE INDEX
    "branch_operation_reconciliations_tenant_id_branch_id_idx"
ON "branch_operation_reconciliations"("tenant_id", "branch_id");

CREATE INDEX
    "branch_operation_reconciliations_tenant_id_updated_at_idx"
ON "branch_operation_reconciliations"("tenant_id", "updated_at");

-- Cash-count history index
CREATE INDEX
    "branch_operation_cash_counts_tenant_id_reconciliation_id_recorded_at_idx"
ON "branch_operation_cash_counts"(
    "tenant_id",
    "reconciliation_id",
    "recorded_at"
);

-- Reconciliation -> Tenant
ALTER TABLE "branch_operation_reconciliations"
ADD CONSTRAINT "branch_operation_reconciliations_tenant_id_fkey"
FOREIGN KEY ("tenant_id")
REFERENCES "tenants"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- Reconciliation -> Branch
ALTER TABLE "branch_operation_reconciliations"
ADD CONSTRAINT "branch_operation_reconciliations_branch_id_fkey"
FOREIGN KEY ("branch_id")
REFERENCES "branches"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- Reconciliation -> Daily operation
ALTER TABLE "branch_operation_reconciliations"
ADD CONSTRAINT "branch_operation_reconciliations_operation_id_fkey"
FOREIGN KEY ("operation_id")
REFERENCES "branch_daily_operations"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- Reconciliation -> User who started it
ALTER TABLE "branch_operation_reconciliations"
ADD CONSTRAINT "branch_operation_reconciliations_started_by_user_id_fkey"
FOREIGN KEY ("started_by_user_id")
REFERENCES "users"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

-- Reconciliation -> User who last updated it
ALTER TABLE "branch_operation_reconciliations"
ADD CONSTRAINT "branch_operation_reconciliations_updated_by_user_id_fkey"
FOREIGN KEY ("updated_by_user_id")
REFERENCES "users"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

-- Cash count -> Tenant
ALTER TABLE "branch_operation_cash_counts"
ADD CONSTRAINT "branch_operation_cash_counts_tenant_id_fkey"
FOREIGN KEY ("tenant_id")
REFERENCES "tenants"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- Cash count -> Reconciliation
ALTER TABLE "branch_operation_cash_counts"
ADD CONSTRAINT "branch_operation_cash_counts_reconciliation_id_fkey"
FOREIGN KEY ("reconciliation_id")
REFERENCES "branch_operation_reconciliations"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- Cash count -> User who recorded it
ALTER TABLE "branch_operation_cash_counts"
ADD CONSTRAINT "branch_operation_cash_counts_recorded_by_user_id_fkey"
FOREIGN KEY ("recorded_by_user_id")
REFERENCES "users"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;
