-- Make offline-first mobile sync available to every role that can use the
-- mobile workspace. Earlier sync permission backfills missed Account Owner,
-- Field Officer, Manager, Cashier, and Field Agent role names.
INSERT INTO "permissions" ("id", "tenant_id", "key", "module_key", "description", "created_at")
SELECT
  gen_random_uuid(),
  "tenants"."id",
  "permission_seed"."key",
  'sync',
  "permission_seed"."description",
  CURRENT_TIMESTAMP
FROM "tenants"
CROSS JOIN (
  VALUES
    ('sync.download', 'Sync: Download snapshot data for offline use'),
    ('sync.upload', 'Sync: Upload pending operations from offline queue')
) AS "permission_seed"("key", "description")
ON CONFLICT ("tenant_id", "key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
JOIN "permissions"
  ON "permissions"."tenant_id" = "roles"."tenant_id"
WHERE "roles"."name" IN (
  'Account Owner',
  'Owner',
  'Workspace Owner',
  'Branch Manager',
  'Manager',
  'Supervisor',
  'Cashier',
  'Agent',
  'Field Agent',
  'Field Officer',
  'Loan Officer',
  'Recovery Officer'
)
  AND "permissions"."key" IN ('sync.download', 'sync.upload')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
