-- Ensure collection permissions exist for every tenant
INSERT INTO "permissions" ("id", "tenant_id", "key", "module_key", "description", "created_at")
SELECT
  gen_random_uuid(),
  "tenants"."id",
  "permission_seed"."key",
  'collections',
  "permission_seed"."description",
  CURRENT_TIMESTAMP
FROM "tenants"
CROSS JOIN (
  VALUES
    ('collection.create', 'Collections: collection.create'),
    ('collection.read', 'Collections: collection.read'),
    ('collection.reconcile', 'Collections: collection.reconcile'),
    ('arrears.read', 'Collections: arrears.read'),
    ('recovery.assign', 'Collections: recovery.assign')
) AS "permission_seed"("key", "description")
ON CONFLICT ("tenant_id", "key") DO NOTHING;

-- Field agents / loan officers need to record and view repayments
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
JOIN "permissions"
  ON "permissions"."tenant_id" = "roles"."tenant_id"
WHERE "roles"."name" IN ('Agent', 'Loan Officer', 'Supervisor', 'Branch Manager', 'Workspace Owner')
  AND "permissions"."key" IN ('collection.create', 'collection.read')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
