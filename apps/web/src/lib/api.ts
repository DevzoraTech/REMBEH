const productionApiUrl = "https://rembeh-api.antikra.com/api/v1";
const developmentApiUrl = "http://localhost:4000/api/v1";

/**
 * Auto environment:
 * - `NEXT_PUBLIC_API_URL` wins if set
 * - `next build` / `next start` (production) → HTTPS production API
 * - `next dev` → local API
 */
export const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "production"
    ? productionApiUrl
    : developmentApiUrl);

export const isProductionApi =
  apiBaseUrl.includes("rembeh-api.antikra.com") ||
  apiBaseUrl === productionApiUrl;

export function formatApiError(message?: string | string[]) {
  if (Array.isArray(message)) {
    return message.join(" ");
  }

  return message ?? "Something went wrong.";
}

export async function readApiJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}
