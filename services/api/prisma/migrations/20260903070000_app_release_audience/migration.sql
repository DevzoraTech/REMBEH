-- Staged mobile rollouts: a release can go to every organisation, or only selected ones.
CREATE TYPE "AppReleaseAudience" AS ENUM ('ALL', 'SELECTED');

ALTER TABLE "app_releases"
ADD COLUMN "audience" "AppReleaseAudience" NOT NULL DEFAULT 'ALL';

CREATE TABLE "app_release_tenants" (
    "release_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_release_tenants_pkey" PRIMARY KEY ("release_id", "tenant_id")
);

CREATE INDEX "app_releases_app_name_platform_is_active_audience_idx"
ON "app_releases"("app_name", "platform", "is_active", "audience");

CREATE INDEX "app_release_tenants_tenant_id_idx" ON "app_release_tenants"("tenant_id");

ALTER TABLE "app_release_tenants"
ADD CONSTRAINT "app_release_tenants_release_id_fkey"
FOREIGN KEY ("release_id") REFERENCES "app_releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_release_tenants"
ADD CONSTRAINT "app_release_tenants_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
