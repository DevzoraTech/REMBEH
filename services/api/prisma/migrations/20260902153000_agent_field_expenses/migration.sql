-- Field officers can record expenses against their issued float.
CREATE TYPE "BranchOperationExpensePaidFrom" AS ENUM ('BRANCH_CASH', 'AGENT_FLOAT');

ALTER TABLE "branch_operation_expenses"
  ADD COLUMN "paid_from" "BranchOperationExpensePaidFrom" NOT NULL DEFAULT 'BRANCH_CASH',
  ADD COLUMN "agent_id" UUID;

ALTER TABLE "branch_operation_expenses"
  ADD CONSTRAINT "branch_operation_expenses_agent_id_fkey"
  FOREIGN KEY ("agent_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "branch_operation_expenses_tenant_id_agent_id_incurred_at_idx"
  ON "branch_operation_expenses"("tenant_id", "agent_id", "incurred_at");

INSERT INTO "permissions" ("id", "tenant_id", "key", "module_key", "description", "created_at")
SELECT
  gen_random_uuid(),
  "tenants"."id",
  'operation.agent.expense.create',
  'operations',
  'Daily Operations: operation.agent.expense.create',
  CURRENT_TIMESTAMP
FROM "tenants"
ON CONFLICT ("tenant_id", "key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
JOIN "permissions"
  ON "permissions"."tenant_id" = "roles"."tenant_id"
WHERE "roles"."name" IN ('Agent', 'Field Officer', 'Loan Officer', 'Recovery Officer')
  AND "permissions"."key" = 'operation.agent.expense.create'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
