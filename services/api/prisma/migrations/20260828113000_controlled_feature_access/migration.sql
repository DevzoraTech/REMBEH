CREATE TYPE "ControlledFeatureScope" AS ENUM ('TENANT', 'BRANCH');

CREATE TABLE "controlled_feature_access" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "feature_key" TEXT NOT NULL,
    "scope" "ControlledFeatureScope" NOT NULL,
    "scope_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "updated_by_admin_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "controlled_feature_access_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "controlled_feature_access_feature_key_scope_scope_id_key"
    ON "controlled_feature_access"("feature_key", "scope", "scope_id");

CREATE INDEX "controlled_feature_access_tenant_id_feature_key_enabled_idx"
    ON "controlled_feature_access"("tenant_id", "feature_key", "enabled");

CREATE INDEX "controlled_feature_access_branch_id_feature_key_idx"
    ON "controlled_feature_access"("branch_id", "feature_key");

ALTER TABLE "controlled_feature_access"
    ADD CONSTRAINT "controlled_feature_access_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "controlled_feature_access"
    ADD CONSTRAINT "controlled_feature_access_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "controlled_feature_access"
    ADD CONSTRAINT "controlled_feature_access_updated_by_admin_id_fkey"
    FOREIGN KEY ("updated_by_admin_id") REFERENCES "control_center_admins"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
