import { ConfigService } from '@nestjs/config';

const DEFAULT_DEV_WEB_APP_URL = 'http://localhost:3000';
const DEFAULT_PROD_WEB_APP_URL = 'https://rembeh.antikra.com';

function isLocalWebOrigin(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1'
    );
  } catch {
    return false;
  }
}

/**
 * Public web app origin for email links (invitations, etc.).
 * Prefers WEB_APP_URL; also accepts APP_WEB_URL / FRONTEND_URL aliases.
 * In production, never emits localhost so emails always point at the live app.
 */
export function resolveWebAppBaseUrl(configService: ConfigService): string {
  const isProduction = configService.get<string>('NODE_ENV') === 'production';
  const candidates = [
    configService.get<string>('WEB_APP_URL'),
    configService.get<string>('APP_WEB_URL'),
    configService.get<string>('FRONTEND_URL'),
    configService.get<string>('WEB_PUBLIC_URL'),
    configService.get<string>('PUBLIC_WEB_URL'),
  ];

  for (const raw of candidates) {
    const value = raw?.trim();
    if (value) {
      const normalized = value.replace(/\/+$/, '');
      if (isProduction && isLocalWebOrigin(normalized)) {
        continue;
      }
      return normalized;
    }
  }

  return isProduction ? DEFAULT_PROD_WEB_APP_URL : DEFAULT_DEV_WEB_APP_URL;
}

export function buildWebAppUrl(
  configService: ConfigService,
  pathname: string,
  searchParams?: Record<string, string>,
): string {
  const baseUrl = resolveWebAppBaseUrl(configService);
  const url = new URL(
    pathname.startsWith('/') ? pathname : `/${pathname}`,
    `${baseUrl}/`,
  );

  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

export function buildStaffInvitationAcceptUrl(
  configService: ConfigService,
  token: string,
): string {
  return buildWebAppUrl(configService, '/staff-invitations/accept', {
    token,
  });
}
