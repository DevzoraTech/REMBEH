-- Daily Operations starts the branch workday before float assignment,
-- field activity, reconciliation, reports, and approval.
CREATE TYPE "BranchOperationStatus" AS ENUM ('OPEN', 'CLOSING', 'CLOSED');

CREATE TABLE "branch_daily_operations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "operation_date" DATE NOT NULL,
    "status" "BranchOperationStatus" NOT NULL DEFAULT 'OPEN',
    "opened_at" TIMESTAMP(3) NOT NULL,
    "opened_by_user_id" UUID NOT NULL,
    "closed_at" TIMESTAMP(3),
    "closed_by_user_id" UUID,
    "cash_in_vault" DECIMAL(18,2) NOT NULL,
    "cash_in_safe" DECIMAL(18,2) NOT NULL,
    "opening_float_available" DECIMAL(18,2) NOT NULL,
    "previous_closing_balance" DECIMAL(18,2) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_daily_operations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "branch_daily_operations_tenant_id_branch_id_operation_date_key"
  ON "branch_daily_operations"("tenant_id", "branch_id", "operation_date");

CREATE INDEX "branch_daily_operations_tenant_id_operation_date_idx"
  ON "branch_daily_operations"("tenant_id", "operation_date");

CREATE INDEX "branch_daily_operations_tenant_id_branch_id_status_idx"
  ON "branch_daily_operations"("tenant_id", "branch_id", "status");

ALTER TABLE "branch_daily_operations"
  ADD CONSTRAINT "branch_daily_operations_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "branch_daily_operations"
  ADD CONSTRAINT "branch_daily_operations_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "branch_daily_operations"
  ADD CONSTRAINT "branch_daily_operations_opened_by_user_id_fkey"
  FOREIGN KEY ("opened_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "branch_daily_operations"
  ADD CONSTRAINT "branch_daily_operations_closed_by_user_id_fkey"
  FOREIGN KEY ("closed_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "tenant_id", "key", "module_key", "description", "created_at")
SELECT
  gen_random_uuid(),
  "tenants"."id",
  "permission_seed"."key",
  'operations',
  "permission_seed"."description",
  CURRENT_TIMESTAMP
FROM "tenants"
CROSS JOIN (
  VALUES
    ('operation.read', 'Daily Operations: operation.read'),
    ('operation.open', 'Daily Operations: operation.open'),
    ('operation.float.manage', 'Daily Operations: operation.float.manage'),
    ('operation.close', 'Daily Operations: operation.close'),
    ('operation.approve', 'Daily Operations: operation.approve')
) AS "permission_seed"("key", "description")
ON CONFLICT ("tenant_id", "key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
JOIN "permissions"
  ON "permissions"."tenant_id" = "roles"."tenant_id"
WHERE "roles"."name" IN ('Account Owner', 'Workspace Owner', 'Branch Manager')
  AND "permissions"."key" IN (
    'operation.read',
    'operation.open',
    'operation.float.manage',
    'operation.close',
    'operation.approve'
  )
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
JOIN "permissions"
  ON "permissions"."tenant_id" = "roles"."tenant_id"
WHERE "roles"."name" IN ('Supervisor', 'Cashier')
  AND "permissions"."key" = 'operation.read'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
