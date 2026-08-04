import { ConfigService } from '@nestjs/config';

const DEFAULT_DEV_API_PUBLIC_URL = 'http://localhost:4000';

/**
 * Public API origin (no trailing slash, no /api/v1 suffix).
 * Used for OAuth redirect URIs.
 */
export function resolveApiPublicBaseUrl(configService: ConfigService): string {
  const candidates = [
    configService.get<string>('API_PUBLIC_URL'),
    configService.get<string>('API_BASE_URL'),
  ];

  for (const raw of candidates) {
    const value = raw?.trim();
    if (value) {
      return value.replace(/\/+$/, '').replace(/\/api\/v1$/i, '');
    }
  }

  return DEFAULT_DEV_API_PUBLIC_URL;
}

export function buildApiV1Url(
  configService: ConfigService,
  pathname: string,
): string {
  const base = resolveApiPublicBaseUrl(configService);
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${base}/api/v1${path}`;
}
