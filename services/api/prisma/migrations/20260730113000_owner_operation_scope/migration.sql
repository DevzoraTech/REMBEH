-- Owners review branch results across the account; branch managers operate the day.
DELETE FROM "role_permissions"
USING "roles", "permissions"
WHERE "role_permissions"."role_id" = "roles"."id"
  AND "role_permissions"."permission_id" = "permissions"."id"
  AND "roles"."name" IN ('Account Owner', 'Workspace Owner')
  AND "permissions"."key" IN (
    'operation.open',
    'operation.float.manage',
    'operation.float.return',
    'operation.cash.topup',
    'operation.expense.create',
    'operation.expense.approve',
    'operation.close',
    'operation.report.review'
  );
