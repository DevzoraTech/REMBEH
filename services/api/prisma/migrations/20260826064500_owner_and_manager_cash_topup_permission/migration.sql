-- Allow account/workspace owners to receive capital while preserving
-- the remaining owner restrictions on branch daily operations.
--
-- Also backfill Branch Manager and Cashier so older tenants cannot
-- be missing operation.cash.topup.

-- Ensure every tenant has the permission itself.
INSERT INTO "permissions" (
  "id",
  "tenant_id",
  "key",
  "module_key",
  "description",
  "created_at"
)
SELECT
  gen_random_uuid(),
  "tenants"."id",
  'operation.cash.topup',
  'operations',
  'Daily Operations: operation.cash.topup',
  CURRENT_TIMESTAMP
FROM "tenants"
ON CONFLICT ("tenant_id", "key") DO NOTHING;


-- Grant the permission to the roles that are allowed to receive capital.
INSERT INTO "role_permissions" (
  "role_id",
  "permission_id"
)
SELECT
  "roles"."id",
  "permissions"."id"
FROM "roles"
JOIN "permissions"
  ON "permissions"."tenant_id" = "roles"."tenant_id"
WHERE LOWER(TRIM("roles"."name")) IN (
  'account owner',
  'workspace owner',
  'owner',
  'branch manager',
  'cashier'
)
AND "permissions"."key" = 'operation.cash.topup'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
