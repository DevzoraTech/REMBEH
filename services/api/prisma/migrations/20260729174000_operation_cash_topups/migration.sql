CREATE TABLE "branch_operation_topups" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "operation_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "description" TEXT,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_operation_topups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "branch_operation_topups_tenant_id_branch_id_added_at_idx"
  ON "branch_operation_topups"("tenant_id", "branch_id", "added_at");

CREATE INDEX "branch_operation_topups_tenant_id_operation_id_idx"
  ON "branch_operation_topups"("tenant_id", "operation_id");

ALTER TABLE "branch_operation_topups"
  ADD CONSTRAINT "branch_operation_topups_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "branch_operation_topups"
  ADD CONSTRAINT "branch_operation_topups_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "branch_operation_topups"
  ADD CONSTRAINT "branch_operation_topups_operation_id_fkey"
  FOREIGN KEY ("operation_id") REFERENCES "branch_daily_operations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "branch_operation_topups"
  ADD CONSTRAINT "branch_operation_topups_recorded_by_user_id_fkey"
  FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "tenant_id", "key", "module_key", "description", "created_at")
SELECT
  gen_random_uuid(),
  "tenants"."id",
  'operation.cash.topup',
  'operations',
  'Daily Operations: operation.cash.topup',
  CURRENT_TIMESTAMP
FROM "tenants"
ON CONFLICT ("tenant_id", "key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
JOIN "permissions"
  ON "permissions"."tenant_id" = "roles"."tenant_id"
WHERE "roles"."name" IN ('Account Owner', 'Workspace Owner', 'Branch Manager', 'Cashier')
  AND "permissions"."key" = 'operation.cash.topup'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
