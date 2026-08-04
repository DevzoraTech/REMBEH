import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuthProvider } from '@prisma/client';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { buildApiV1Url } from '../../common/config/api-public-url';

export type OAuthIntent = 'login' | 'register';

export type NormalizedOAuthProfile = {
  provider: OAuthProvider;
  providerSubject: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
  rawProfile: Record<string, unknown>;
};

type OAuthStatePayload = {
  typ: 'oauth_state';
  provider: OAuthProvider;
  intent: OAuthIntent;
  next: string | null;
  nonce: string;
  iat: number;
  exp: number;
};

type OnboardingTokenPayload = {
  typ: 'oauth_onboarding';
  provider: OAuthProvider;
  providerSubject: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
  iat: number;
  exp: number;
};

const STATE_TTL_SECONDS = 10 * 60;
const ONBOARDING_TTL_SECONDS = 30 * 60;

@Injectable()
export class OAuthProvidersService {
  constructor(private readonly configService: ConfigService) {}

  parseProvider(raw: string): OAuthProvider {
    const normalized = raw.trim().toUpperCase();
    if (normalized === 'GOOGLE') {
      return OAuthProvider.GOOGLE;
    }
    if (normalized === 'MICROSOFT') {
      return OAuthProvider.MICROSOFT;
    }
    throw new BadRequestException('Unsupported OAuth provider.');
  }

  isProviderConfigured(provider: OAuthProvider): boolean {
    try {
      this.getClientCredentials(provider);
      return true;
    } catch {
      return false;
    }
  }

  buildAuthorizationUrl(input: {
    provider: OAuthProvider;
    intent: OAuthIntent;
    next?: string | null;
  }): string {
    const { clientId } = this.getClientCredentials(input.provider);
    const redirectUri = this.getRedirectUri(input.provider);
    const state = this.signState({
      provider: input.provider,
      intent: input.intent,
      next: this.sanitizeNextPath(input.next),
    });

    if (input.provider === OAuthProvider.GOOGLE) {
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', 'openid email profile');
      url.searchParams.set('access_type', 'online');
      url.searchParams.set('prompt', 'select_account');
      url.searchParams.set('state', state);
      return url.toString();
    }

    const tenant = this.getMicrosoftTenant();
    const url = new URL(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    );
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('response_mode', 'query');
    url.searchParams.set('scope', 'openid profile email User.Read');
    url.searchParams.set('prompt', 'select_account');
    url.searchParams.set('state', state);
    return url.toString();
  }

  verifyState(rawState: string): OAuthStatePayload {
    const payload = this.verifySignedJson<OAuthStatePayload>(rawState);
    if (
      payload.typ !== 'oauth_state' ||
      !payload.provider ||
      !payload.intent ||
      !payload.nonce
    ) {
      throw new BadRequestException('Invalid OAuth state.');
    }
    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new BadRequestException('OAuth state has expired. Try again.');
    }
    return payload;
  }

  issueOnboardingToken(profile: NormalizedOAuthProfile): string {
    const now = Math.floor(Date.now() / 1000);
    const payload: OnboardingTokenPayload = {
      typ: 'oauth_onboarding',
      provider: profile.provider,
      providerSubject: profile.providerSubject,
      email: profile.email,
      emailVerified: profile.emailVerified,
      displayName: profile.displayName,
      iat: now,
      exp: now + ONBOARDING_TTL_SECONDS,
    };
    return this.signJson(payload);
  }

  verifyOnboardingToken(token: string): OnboardingTokenPayload {
    const payload = this.verifySignedJson<OnboardingTokenPayload>(token);
    if (
      payload.typ !== 'oauth_onboarding' ||
      !payload.provider ||
      !payload.providerSubject ||
      !payload.email
    ) {
      throw new BadRequestException('Invalid OAuth onboarding token.');
    }
    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new BadRequestException(
        'OAuth onboarding session expired. Continue with Google or Microsoft again.',
      );
    }
    if (!payload.emailVerified) {
      throw new BadRequestException(
        'Your provider email is not verified. Use a verified Google or Microsoft account.',
      );
    }
    return payload;
  }

  async exchangeAuthorizationCode(input: {
    provider: OAuthProvider;
    code: string;
  }): Promise<NormalizedOAuthProfile> {
    const { clientId, clientSecret } = this.getClientCredentials(input.provider);
    const redirectUri = this.getRedirectUri(input.provider);

    if (input.provider === OAuthProvider.GOOGLE) {
      return this.exchangeGoogleCode({
        clientId,
        clientSecret,
        redirectUri,
        code: input.code,
      });
    }

    return this.exchangeMicrosoftCode({
      clientId,
      clientSecret,
      redirectUri,
      code: input.code,
    });
  }

  private async exchangeGoogleCode(input: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    code: string;
  }): Promise<NormalizedOAuthProfile> {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: input.code,
        client_id: input.clientId,
        client_secret: input.clientSecret,
        redirect_uri: input.redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenPayload = (await tokenResponse.json()) as {
      access_token?: string;
      id_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenResponse.ok || !tokenPayload.access_token) {
      throw new BadRequestException(
        tokenPayload.error_description ||
          tokenPayload.error ||
          'Google authorization failed.',
      );
    }

    const profileResponse = await fetch(
      'https://openidconnect.googleapis.com/v1/userinfo',
      {
        headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
      },
    );
    const profile = (await profileResponse.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean | string;
      name?: string;
      given_name?: string;
      family_name?: string;
    };

    if (!profileResponse.ok || !profile.sub || !profile.email) {
      throw new BadRequestException(
        'Unable to read Google account profile.',
      );
    }

    const emailVerified =
      profile.email_verified === true || profile.email_verified === 'true';

    return {
      provider: OAuthProvider.GOOGLE,
      providerSubject: profile.sub,
      email: profile.email.trim().toLowerCase(),
      emailVerified,
      displayName:
        profile.name?.trim() ||
        [profile.given_name, profile.family_name].filter(Boolean).join(' ') ||
        null,
      rawProfile: profile as Record<string, unknown>,
    };
  }

  private async exchangeMicrosoftCode(input: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    code: string;
  }): Promise<NormalizedOAuthProfile> {
    const tenant = this.getMicrosoftTenant();
    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: input.code,
          client_id: input.clientId,
          client_secret: input.clientSecret,
          redirect_uri: input.redirectUri,
          grant_type: 'authorization_code',
          scope: 'openid profile email User.Read',
        }),
      },
    );

    const tokenPayload = (await tokenResponse.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenResponse.ok || !tokenPayload.access_token) {
      throw new BadRequestException(
        tokenPayload.error_description ||
          tokenPayload.error ||
          'Microsoft authorization failed.',
      );
    }

    const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
    });
    const profile = (await profileResponse.json()) as {
      id?: string;
      mail?: string | null;
      userPrincipalName?: string | null;
      displayName?: string | null;
      givenName?: string | null;
      surname?: string | null;
    };

    if (!profileResponse.ok || !profile.id) {
      throw new BadRequestException(
        'Unable to read Microsoft account profile.',
      );
    }

    const email = (profile.mail || profile.userPrincipalName || '')
      .trim()
      .toLowerCase();
    if (!email || !email.includes('@')) {
      throw new BadRequestException(
        'Microsoft account did not return a usable email address.',
      );
    }

    return {
      provider: OAuthProvider.MICROSOFT,
      providerSubject: profile.id,
      email,
      // Microsoft Graph /me does not always expose email_verified; treat
      // work/school + consumer accounts that return mail/UPN as verified.
      emailVerified: true,
      displayName:
        profile.displayName?.trim() ||
        [profile.givenName, profile.surname].filter(Boolean).join(' ') ||
        null,
      rawProfile: profile as Record<string, unknown>,
    };
  }

  private getRedirectUri(provider: OAuthProvider): string {
    const providerPath =
      provider === OAuthProvider.GOOGLE ? 'google' : 'microsoft';
    return buildApiV1Url(
      this.configService,
      `/auth/oauth/${providerPath}/callback`,
    );
  }

  private getClientCredentials(provider: OAuthProvider): {
    clientId: string;
    clientSecret: string;
  } {
    if (provider === OAuthProvider.GOOGLE) {
      const clientId = this.configService
        .get<string>('GOOGLE_OAUTH_CLIENT_ID')
        ?.trim();
      const clientSecret = this.configService
        .get<string>('GOOGLE_OAUTH_CLIENT_SECRET')
        ?.trim();
      if (!clientId || !clientSecret) {
        throw new ServiceUnavailableException(
          'Google sign-in is not configured.',
        );
      }
      return { clientId, clientSecret };
    }

    const clientId = this.configService
      .get<string>('MICROSOFT_OAUTH_CLIENT_ID')
      ?.trim();
    const clientSecret = this.configService
      .get<string>('MICROSOFT_OAUTH_CLIENT_SECRET')
      ?.trim();
    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException(
        'Microsoft sign-in is not configured.',
      );
    }
    return { clientId, clientSecret };
  }

  private getMicrosoftTenant(): string {
    return (
      this.configService.get<string>('MICROSOFT_OAUTH_TENANT')?.trim() ||
      'common'
    );
  }

  private sanitizeNextPath(next?: string | null): string | null {
    if (!next?.trim()) {
      return null;
    }
    const value = next.trim();
    if (!value.startsWith('/') || value.startsWith('//')) {
      return null;
    }
    return value.slice(0, 500);
  }

  private signState(input: {
    provider: OAuthProvider;
    intent: OAuthIntent;
    next: string | null;
  }): string {
    const now = Math.floor(Date.now() / 1000);
    const payload: OAuthStatePayload = {
      typ: 'oauth_state',
      provider: input.provider,
      intent: input.intent,
      next: input.next,
      nonce: randomBytes(16).toString('hex'),
      iat: now,
      exp: now + STATE_TTL_SECONDS,
    };
    return this.signJson(payload);
  }

  private signJson(payload: Record<string, unknown>): string {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', this.getTicketSecret())
      .update(encoded)
      .digest('base64url');
    return `${encoded}.${signature}`;
  }

  private verifySignedJson<T extends Record<string, unknown>>(
    token: string,
  ): T {
    const [encoded, signature] = token.split('.');
    if (!encoded || !signature) {
      throw new BadRequestException('Invalid OAuth token.');
    }

    const expected = createHmac('sha256', this.getTicketSecret())
      .update(encoded)
      .digest('base64url');
    const providedBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expected);
    if (
      providedBuf.length !== expectedBuf.length ||
      !timingSafeEqual(providedBuf, expectedBuf)
    ) {
      throw new BadRequestException('Invalid OAuth token signature.');
    }

    try {
      return JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8'),
      ) as T;
    } catch {
      throw new BadRequestException('Invalid OAuth token payload.');
    }
  }

  private getTicketSecret(): string {
    const dedicated = this.configService.get<string>('OAUTH_STATE_SECRET')?.trim();
    if (dedicated && dedicated.length >= 16) {
      return dedicated;
    }
    const jwt = this.configService.get<string>('JWT_ACCESS_SECRET')?.trim();
    if (!jwt || jwt.length < 16) {
      throw new Error(
        'JWT_ACCESS_SECRET or OAUTH_STATE_SECRET must be set to at least 16 characters.',
      );
    }
    return jwt;
  }
}
