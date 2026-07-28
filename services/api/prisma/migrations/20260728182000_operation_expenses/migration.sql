-- Daily operating expenses reduce the cash that remains at the branch before
-- closing. They belong to the branch daily operation for a specific day.
CREATE TYPE "BranchOperationExpenseCategory" AS ENUM (
  'TRANSPORT',
  'FUEL',
  'MEALS',
  'AIRTIME',
  'MOBILE_MONEY_CHARGES',
  'STATIONERY',
  'REPAIRS',
  'UTILITIES',
  'OTHER'
);

CREATE TABLE "branch_operation_expenses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "operation_id" UUID NOT NULL,
    "category" "BranchOperationExpenseCategory" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "description" TEXT,
    "incurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by_user_id" UUID NOT NULL,
    "approved_at" TIMESTAMP(3),
    "approved_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_operation_expenses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "branch_operation_expenses_tenant_id_branch_id_incurred_at_idx"
  ON "branch_operation_expenses"("tenant_id", "branch_id", "incurred_at");

CREATE INDEX "branch_operation_expenses_tenant_id_operation_id_idx"
  ON "branch_operation_expenses"("tenant_id", "operation_id");

ALTER TABLE "branch_operation_expenses"
  ADD CONSTRAINT "branch_operation_expenses_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "branch_operation_expenses"
  ADD CONSTRAINT "branch_operation_expenses_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "branch_operation_expenses"
  ADD CONSTRAINT "branch_operation_expenses_operation_id_fkey"
  FOREIGN KEY ("operation_id") REFERENCES "branch_daily_operations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "branch_operation_expenses"
  ADD CONSTRAINT "branch_operation_expenses_recorded_by_user_id_fkey"
  FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "branch_operation_expenses"
  ADD CONSTRAINT "branch_operation_expenses_approved_by_user_id_fkey"
  FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id")
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
    ('operation.expense.create', 'Daily Operations: operation.expense.create'),
    ('operation.expense.approve', 'Daily Operations: operation.expense.approve')
) AS "permission_seed"("key", "description")
ON CONFLICT ("tenant_id", "key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
JOIN "permissions"
  ON "permissions"."tenant_id" = "roles"."tenant_id"
WHERE "roles"."name" IN ('Account Owner', 'Workspace Owner', 'Branch Manager')
  AND "permissions"."key" IN (
    'operation.expense.create',
    'operation.expense.approve'
  )
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
JOIN "permissions"
  ON "permissions"."tenant_id" = "roles"."tenant_id"
WHERE "roles"."name" IN ('Cashier')
  AND "permissions"."key" = 'operation.expense.create'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
