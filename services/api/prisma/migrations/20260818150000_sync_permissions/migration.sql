-- Ensure sync permissions exist for every tenant
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

-- Field agents and staff need sync permissions for offline-first mobile app
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
JOIN "permissions"
  ON "permissions"."tenant_id" = "roles"."tenant_id"
WHERE "roles"."name" IN ('Agent', 'Loan Officer', 'Supervisor', 'Recovery Officer', 'Branch Manager', 'Workspace Owner')
  AND "permissions"."key" IN ('sync.download', 'sync.upload')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
