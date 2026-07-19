CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO "permissions" ("id", "tenant_id", "key", "module_key", "description", "created_at")
SELECT
  gen_random_uuid(),
  "tenants"."id",
  "permission_seed"."key",
  'workspace',
  "permission_seed"."description",
  CURRENT_TIMESTAMP
FROM "tenants"
CROSS JOIN (
  VALUES
    ('branch.staff.read', 'Workspace: branch.staff.read'),
    ('branch.staff.invite', 'Workspace: branch.staff.invite')
) AS "permission_seed"("key", "description")
ON CONFLICT ("tenant_id", "key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
JOIN "permissions"
  ON "permissions"."tenant_id" = "roles"."tenant_id"
WHERE "roles"."name" = 'Workspace Owner'
  AND "permissions"."key" IN ('branch.staff.read', 'branch.staff.invite')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
