-- Closed branch days produce one stable report for manager review and owner approval.
CREATE TYPE "BranchOperationReportStatus" AS ENUM (
  'MANAGER_REVIEW',
  'SENT_TO_OWNER',
  'OWNER_APPROVED',
  'RETURNED_TO_MANAGER'
);

CREATE TABLE "branch_operation_reports" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "operation_id" UUID NOT NULL,
    "report_number" TEXT NOT NULL,
    "operation_date" DATE NOT NULL,
    "status" "BranchOperationReportStatus" NOT NULL DEFAULT 'MANAGER_REVIEW',
    "snapshot" JSONB NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "manager_reviewed_at" TIMESTAMP(3),
    "manager_reviewed_by_id" UUID,
    "manager_notes" TEXT,
    "owner_approved_at" TIMESTAMP(3),
    "owner_approved_by_id" UUID,
    "owner_notes" TEXT,
    "returned_at" TIMESTAMP(3),
    "returned_by_id" UUID,
    "return_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_operation_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "branch_operation_reports_operation_id_key"
  ON "branch_operation_reports"("operation_id");

CREATE UNIQUE INDEX "branch_operation_reports_tenant_id_report_number_key"
  ON "branch_operation_reports"("tenant_id", "report_number");

CREATE INDEX "branch_operation_reports_tenant_id_branch_id_operation_date_idx"
  ON "branch_operation_reports"("tenant_id", "branch_id", "operation_date");

CREATE INDEX "branch_operation_reports_tenant_id_status_idx"
  ON "branch_operation_reports"("tenant_id", "status");

ALTER TABLE "branch_operation_reports"
  ADD CONSTRAINT "branch_operation_reports_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "branch_operation_reports"
  ADD CONSTRAINT "branch_operation_reports_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "branch_operation_reports"
  ADD CONSTRAINT "branch_operation_reports_operation_id_fkey"
  FOREIGN KEY ("operation_id") REFERENCES "branch_daily_operations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "branch_operation_reports"
  ADD CONSTRAINT "branch_operation_reports_manager_reviewed_by_id_fkey"
  FOREIGN KEY ("manager_reviewed_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "branch_operation_reports"
  ADD CONSTRAINT "branch_operation_reports_owner_approved_by_id_fkey"
  FOREIGN KEY ("owner_approved_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "branch_operation_reports"
  ADD CONSTRAINT "branch_operation_reports_returned_by_id_fkey"
  FOREIGN KEY ("returned_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "tenant_id", "key", "module_key", "description", "created_at")
SELECT
  gen_random_uuid(),
  "tenants"."id",
  'operation.report.review',
  'operations',
  'Daily Operations: operation.report.review',
  CURRENT_TIMESTAMP
FROM "tenants"
ON CONFLICT ("tenant_id", "key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
JOIN "permissions"
  ON "permissions"."tenant_id" = "roles"."tenant_id"
WHERE "roles"."name" IN ('Account Owner', 'Workspace Owner', 'Branch Manager')
  AND "permissions"."key" = 'operation.report.review'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
