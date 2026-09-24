CREATE TABLE "branch_operation_bankings" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "operation_id" UUID NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "reference" TEXT,
  "notes" TEXT,
  "receipt_storage_key" TEXT,
  "receipt_mime_type" TEXT,
  "receipt_file_name" TEXT,
  "banked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recorded_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "branch_operation_bankings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "branch_operation_bankings_tenant_id_branch_id_banked_at_idx"
  ON "branch_operation_bankings"("tenant_id", "branch_id", "banked_at");

CREATE INDEX "branch_operation_bankings_tenant_id_operation_id_idx"
  ON "branch_operation_bankings"("tenant_id", "operation_id");

ALTER TABLE "branch_operation_bankings"
  ADD CONSTRAINT "branch_operation_bankings_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "branch_operation_bankings"
  ADD CONSTRAINT "branch_operation_bankings_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "branch_operation_bankings"
  ADD CONSTRAINT "branch_operation_bankings_operation_id_fkey"
  FOREIGN KEY ("operation_id") REFERENCES "branch_daily_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "branch_operation_bankings"
  ADD CONSTRAINT "branch_operation_bankings_recorded_by_user_id_fkey"
  FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "permissions" (
  "id", "tenant_id", "key", "module_key", "description", "created_at"
)
SELECT
  gen_random_uuid(), "tenants"."id", 'operation.banking.create', 'operations',
  'Daily Operations: operation.banking.create', CURRENT_TIMESTAMP
FROM "tenants"
ON CONFLICT ("tenant_id", "key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
JOIN "permissions" ON "permissions"."tenant_id" = "roles"."tenant_id"
WHERE LOWER(TRIM("roles"."name")) IN ('branch manager', 'cashier')
  AND "permissions"."key" = 'operation.banking.create'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
