-- CreateEnum
CREATE TYPE "MarketingCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MarketingCampaignPlacement" AS ENUM ('MOBILE_HEADER');

-- CreateEnum
CREATE TYPE "MarketingCampaignAudience" AS ENUM ('ALL_USERS', 'TENANT_USERS', 'BRANCH_USERS', 'TENANT_OWNERS', 'ROLE_USERS', 'SELECTED_USERS');

-- CreateEnum
CREATE TYPE "MarketingCampaignMediaType" AS ENUM ('NONE', 'IMAGE', 'VIDEO');

-- CreateTable
CREATE TABLE "marketing_campaigns" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "cta_label" TEXT,
    "cta_url" TEXT,
    "media_url" TEXT,
    "media_storage_key" TEXT,
    "media_type" "MarketingCampaignMediaType" NOT NULL DEFAULT 'NONE',
    "placement" "MarketingCampaignPlacement" NOT NULL DEFAULT 'MOBILE_HEADER',
    "audience" "MarketingCampaignAudience" NOT NULL DEFAULT 'TENANT_USERS',
    "status" "MarketingCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "tenant_id" UUID,
    "branch_id" UUID,
    "role_names" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "user_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "priority" INTEGER NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMP(3),
    "created_by_admin_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "marketing_campaigns_status_placement_starts_at_ends_at_idx" ON "marketing_campaigns"("status", "placement", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "marketing_campaigns_tenant_id_branch_id_status_idx" ON "marketing_campaigns"("tenant_id", "branch_id", "status");

-- CreateIndex
CREATE INDEX "marketing_campaigns_created_by_admin_id_created_at_idx" ON "marketing_campaigns"("created_by_admin_id", "created_at");

-- AddForeignKey
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "control_center_admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
