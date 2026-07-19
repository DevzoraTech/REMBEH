import { ConfigService } from '@nestjs/config';

const DEFAULT_DEV_WEB_APP_URL = 'http://localhost:3000';

/**
 * Public web app origin for email links (invitations, etc.).
 * Prefers WEB_APP_URL; also accepts APP_WEB_URL / FRONTEND_URL aliases.
 */
export function resolveWebAppBaseUrl(
  configService: ConfigService,
): string {
  const candidates = [
    configService.get<string>('WEB_APP_URL'),
    configService.get<string>('APP_WEB_URL'),
    configService.get<string>('FRONTEND_URL'),
  ];

  for (const raw of candidates) {
    const value = raw?.trim();
    if (value) {
      return value.replace(/\/+$/, '');
    }
  }

  return DEFAULT_DEV_WEB_APP_URL;
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
