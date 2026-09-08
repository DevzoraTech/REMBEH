export type MarketingCampaignStatusContract =
  'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

export type MarketingCampaignAudienceContract =
  | 'ALL_USERS'
  | 'TENANT_USERS'
  | 'BRANCH_USERS'
  | 'TENANT_OWNERS'
  | 'ROLE_USERS'
  | 'SELECTED_USERS';

export type MarketingCampaignMediaTypeContract = 'NONE' | 'IMAGE' | 'VIDEO';

export type MarketingCampaignCategoryContract =
  | 'CRITICAL_WARNING'
  | 'PRODUCT_UPDATE'
  | 'PROMOTIONAL';

export type MarketingCampaignCtaActionContract =
  | 'EXTERNAL_URL'
  | 'INTERNAL_ROUTE';

export type MarketingCampaignContract = {
  id: string;
  title: string;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  ctaAction: MarketingCampaignCtaActionContract;
  ctaRoute: string | null;
  category: MarketingCampaignCategoryContract;
  mediaUrl: string | null;
  mediaStorageKey: string | null;
  mediaType: MarketingCampaignMediaTypeContract;
  placement: 'MOBILE_HEADER';
  audience: MarketingCampaignAudienceContract;
  status: MarketingCampaignStatusContract;
  tenantId: string | null;
  branchId: string | null;
  tenantName: string | null;
  branchName: string | null;
  roleNames: string[];
  userIds: string[];
  priority: number;
  startsAt: string;
  endsAt: string | null;
  createdBy: {
    id: string;
    name: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type MarketingCampaignListContract = {
  stats: {
    total: number;
    active: number;
    draft: number;
    paused: number;
    archived: number;
  };
  campaigns: MarketingCampaignContract[];
  internalRoutes: Array<{ key: string; label: string }>;
};

export type MobileMarketingCampaignContract = Pick<
  MarketingCampaignContract,
  | 'id'
  | 'title'
  | 'body'
  | 'ctaLabel'
  | 'ctaUrl'
  | 'ctaAction'
  | 'ctaRoute'
  | 'category'
  | 'mediaUrl'
  | 'mediaType'
  | 'priority'
  | 'startsAt'
  | 'endsAt'
>;

export type MobileMarketingCampaignResponseContract = {
  campaign: MobileMarketingCampaignContract | null;
};
