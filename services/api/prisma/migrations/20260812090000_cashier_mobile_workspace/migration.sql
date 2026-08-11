-- Mobile manager/cashier workspace needs the same branch data surfaces as web:
-- borrowers, loans, repayments, shortages, reports, and daily close controls.
INSERT INTO "permissions" ("id", "tenant_id", "key", "module_key", "description", "created_at")
SELECT
  gen_random_uuid(),
  "tenants"."id",
  "permission_seed"."key",
  "permission_seed"."module_key",
  "permission_seed"."description",
  CURRENT_TIMESTAMP
FROM "tenants"
CROSS JOIN (
  VALUES
    ('branch.read', 'workspace', 'Branches: branch.read'),
    ('customer.create', 'customers', 'Customers: customer.create'),
    ('customer.read', 'customers', 'Customers: customer.read'),
    ('customer.update', 'customers', 'Customers: customer.update'),
    ('loan.create', 'loans', 'Loans: loan.create'),
    ('loan.read', 'loans', 'Loans: loan.read'),
    ('collection.create', 'collections', 'Collections: collection.create'),
    ('collection.read', 'collections', 'Collections: collection.read'),
    ('operation.read', 'operations', 'Daily Operations: operation.read'),
    ('operation.open', 'operations', 'Daily Operations: operation.open'),
    ('operation.float.manage', 'operations', 'Daily Operations: operation.float.manage'),
    ('operation.float.return', 'operations', 'Daily Operations: operation.float.return'),
    ('operation.cash.topup', 'operations', 'Daily Operations: operation.cash.topup'),
    ('operation.expense.create', 'operations', 'Daily Operations: operation.expense.create'),
    ('operation.close', 'operations', 'Daily Operations: operation.close'),
    ('operation.report.review', 'operations', 'Daily Operations: operation.report.review'),
    ('cashier.read', 'cashiers', 'Cashiers: cashier.read')
) AS "permission_seed"("key", "module_key", "description")
ON CONFLICT ("tenant_id", "key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
JOIN "permissions"
  ON "permissions"."tenant_id" = "roles"."tenant_id"
WHERE LOWER("roles"."name") IN ('branch manager', 'cashier')
  AND "permissions"."key" IN (
    'branch.read',
    'customer.create',
    'customer.read',
    'customer.update',
    'loan.create',
    'loan.read',
    'collection.create',
    'collection.read',
    'operation.read',
    'operation.open',
    'operation.float.manage',
    'operation.float.return',
    'operation.cash.topup',
    'operation.expense.create',
    'operation.close',
    'operation.report.review',
    'cashier.read'
  )
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
