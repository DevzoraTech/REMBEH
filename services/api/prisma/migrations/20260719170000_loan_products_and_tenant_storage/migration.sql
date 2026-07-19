-- Tenant storage prefix for professional per-company S3 layout.
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "storage_prefix" TEXT;

UPDATE "tenants"
SET "storage_prefix" = 'tenants/' || "id"::text || '/'
WHERE "storage_prefix" IS NULL;

-- Manager-configured loan rate catalog.
CREATE TABLE IF NOT EXISTS "loan_rate_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "label" TEXT NOT NULL,
    "interest_rate_percent" DECIMAL(8,4) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "loan_rate_options_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "loan_period_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "label" TEXT NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "loan_period_options_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "loan_rate_options_tenant_id_branch_id_is_active_idx"
  ON "loan_rate_options"("tenant_id", "branch_id", "is_active");
CREATE INDEX IF NOT EXISTS "loan_rate_options_tenant_id_is_active_sort_order_idx"
  ON "loan_rate_options"("tenant_id", "is_active", "sort_order");

CREATE INDEX IF NOT EXISTS "loan_period_options_tenant_id_branch_id_is_active_idx"
  ON "loan_period_options"("tenant_id", "branch_id", "is_active");
CREATE INDEX IF NOT EXISTS "loan_period_options_tenant_id_is_active_sort_order_idx"
  ON "loan_period_options"("tenant_id", "is_active", "sort_order");

ALTER TABLE "loan_rate_options" DROP CONSTRAINT IF EXISTS "loan_rate_options_tenant_id_fkey";
ALTER TABLE "loan_rate_options"
  ADD CONSTRAINT "loan_rate_options_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "loan_rate_options" DROP CONSTRAINT IF EXISTS "loan_rate_options_branch_id_fkey";
ALTER TABLE "loan_rate_options"
  ADD CONSTRAINT "loan_rate_options_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "loan_period_options" DROP CONSTRAINT IF EXISTS "loan_period_options_tenant_id_fkey";
ALTER TABLE "loan_period_options"
  ADD CONSTRAINT "loan_period_options_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "loan_period_options" DROP CONSTRAINT IF EXISTS "loan_period_options_branch_id_fkey";
ALTER TABLE "loan_period_options"
  ADD CONSTRAINT "loan_period_options_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Product-manage permission for existing tenants + owner/manager roles.
INSERT INTO "permissions" ("id", "tenant_id", "key", "module_key", "description", "created_at")
SELECT
  gen_random_uuid(),
  "tenants"."id",
  'loan.product.manage',
  'loans',
  'Loans: loan.product.manage',
  CURRENT_TIMESTAMP
FROM "tenants"
ON CONFLICT ("tenant_id", "key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
JOIN "permissions"
  ON "permissions"."tenant_id" = "roles"."tenant_id"
WHERE "roles"."name" IN ('Account Owner', 'Branch Manager')
  AND "permissions"."key" = 'loan.product.manage'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
