-- Managers and owners review repayment correction requests.
-- The original correction-request migration created collection.reconcile,
-- but older roles only received collection.read/create.
INSERT INTO "permissions" ("id", "tenant_id", "key", "module_key", "description", "created_at")
SELECT
  gen_random_uuid(),
  "tenants"."id",
  'collection.reconcile',
  'collections',
  'Collections: collection.reconcile',
  CURRENT_TIMESTAMP
FROM "tenants"
ON CONFLICT ("tenant_id", "key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
JOIN "permissions"
  ON "permissions"."tenant_id" = "roles"."tenant_id"
WHERE "roles"."name" IN ('Account Owner', 'Workspace Owner', 'Branch Manager', 'Manager', 'Supervisor')
  AND "permissions"."key" = 'collection.reconcile'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
