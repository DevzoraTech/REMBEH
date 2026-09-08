/** Internal app pages that marketing CTAs can open. */
export const MARKETING_INTERNAL_ROUTES = [
  { key: 'home', label: 'Home' },
  { key: 'ops', label: 'Daily Operations (Ops)' },
  { key: 'records', label: 'Records' },
  { key: 'clients', label: 'Clients' },
  { key: 'more', label: 'More' },
  { key: 'subscription', label: 'Subscription & SMS' },
  { key: 'subscription_sms', label: 'SMS bundles' },
  { key: 'subscription_plan', label: 'Plan renewal' },
  { key: 'corrections', label: 'Repayment corrections' },
  { key: 'reports', label: 'Reports' },
  { key: 'profile', label: 'Profile' },
  { key: 'settings', label: 'Settings' },
] as const;

export type MarketingInternalRouteKey =
  (typeof MARKETING_INTERNAL_ROUTES)[number]['key'];

const ROUTE_KEYS = new Set(
  MARKETING_INTERNAL_ROUTES.map((route) => route.key),
);

export function isMarketingInternalRoute(
  value: string | null | undefined,
): value is MarketingInternalRouteKey {
  return Boolean(value && ROUTE_KEYS.has(value as MarketingInternalRouteKey));
}
