-- Design templates + CTA action routing for in-app marketing cards.

CREATE TYPE "MarketingCampaignCategory" AS ENUM (
  'CRITICAL_WARNING',
  'PRODUCT_UPDATE',
  'PROMOTIONAL'
);

CREATE TYPE "MarketingCampaignCtaAction" AS ENUM (
  'EXTERNAL_URL',
  'INTERNAL_ROUTE'
);

ALTER TABLE "marketing_campaigns"
  ADD COLUMN "category" "MarketingCampaignCategory" NOT NULL DEFAULT 'PRODUCT_UPDATE',
  ADD COLUMN "cta_action" "MarketingCampaignCtaAction" NOT NULL DEFAULT 'EXTERNAL_URL',
  ADD COLUMN "cta_route" TEXT;
