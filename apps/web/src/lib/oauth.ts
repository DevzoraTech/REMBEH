import { apiBaseUrl } from "./api";

export type OAuthProviderId = "google" | "microsoft";

export function oauthStartUrl(
  provider: OAuthProviderId,
  intent: "login" | "register",
  next?: string | null,
) {
  const url = new URL(`${apiBaseUrl}/auth/oauth/${provider}/start`);
  url.searchParams.set("intent", intent);
  if (next?.trim()) {
    url.searchParams.set("next", next.trim());
  }
  return url.toString();
}

export function beginOAuth(
  provider: OAuthProviderId,
  intent: "login" | "register",
  next?: string | null,
) {
  window.location.assign(oauthStartUrl(provider, intent, next));
}
