-- Agent return and branch closing controls.
ALTER TABLE "agent_daily_floats"
  ADD COLUMN "amount_returned" DECIMAL(14,2),
  ADD COLUMN "returned_at" TIMESTAMP(3),
  ADD COLUMN "returned_by_user_id" UUID,
  ADD COLUMN "return_notes" TEXT;

ALTER TABLE "agent_daily_floats"
  ADD CONSTRAINT "agent_daily_floats_returned_by_user_id_fkey"
  FOREIGN KEY ("returned_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "branch_daily_operations"
  ADD COLUMN "closing_notes" TEXT;

INSERT INTO "permissions" ("id", "tenant_id", "key", "module_key", "description", "created_at")
SELECT
  gen_random_uuid(),
  "tenants"."id",
  'operation.float.return',
  'operations',
  'Daily Operations: operation.float.return',
  CURRENT_TIMESTAMP
FROM "tenants"
ON CONFLICT ("tenant_id", "key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
JOIN "permissions"
  ON "permissions"."tenant_id" = "roles"."tenant_id"
WHERE "roles"."name" IN ('Account Owner', 'Workspace Owner', 'Branch Manager', 'Cashier')
  AND "permissions"."key" = 'operation.float.return'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
