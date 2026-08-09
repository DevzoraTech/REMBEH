import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AccessTokenPayload, RefreshTokenPayload } from './authenticated-user';

/** Access tokens are short-lived; clients refresh via refresh token. */
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
type TokenKind = 'access' | 'refresh';

@Injectable()
export class JwtTokenService {
  constructor(private readonly configService: ConfigService) {}

  get refreshTokenTtlSeconds() {
    return REFRESH_TOKEN_TTL_SECONDS;
  }

  issueAccessToken(input: {
    userId: string;
    tenantId: string;
    sessionId?: string;
  }) {
    const now = Math.floor(Date.now() / 1000);
    const payload: AccessTokenPayload = {
      typ: 'access',
      sub: input.userId,
      tenantId: input.tenantId,
      ...(input.sessionId ? { sid: input.sessionId } : {}),
      iat: now,
      exp: now + ACCESS_TOKEN_TTL_SECONDS,
    };

    return {
      accessToken: this.sign(payload, 'access'),
      expiresAt: new Date(payload.exp * 1000).toISOString(),
    };
  }

  issueRefreshToken(input: {
    userId: string;
    tenantId: string;
    sessionId?: string;
  }) {
    const now = Math.floor(Date.now() / 1000);
    const payload: RefreshTokenPayload = {
      typ: 'refresh',
      sub: input.userId,
      tenantId: input.tenantId,
      ...(input.sessionId ? { sid: input.sessionId } : {}),
      iat: now,
      exp: now + REFRESH_TOKEN_TTL_SECONDS,
    };

    return {
      refreshToken: this.sign(payload, 'refresh'),
      refreshExpiresAt: new Date(payload.exp * 1000).toISOString(),
    };
  }

  issueTokenPair(input: {
    userId: string;
    tenantId: string;
    sessionId?: string;
  }) {
    return {
      ...this.issueAccessToken(input),
      ...this.issueRefreshToken(input),
    };
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    const payload = this.verifyToken(token, 'access');
    if (payload.typ !== 'access') {
      throw new UnauthorizedException('Invalid token type.');
    }
    return payload;
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    const payload = this.verifyToken(token, 'refresh');
    if (payload.typ !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token.');
    }
    return payload;
  }

  private verifyToken(
    token: string,
    kind: TokenKind,
  ): AccessTokenPayload | RefreshTokenPayload {
    const [encodedHeader, encodedPayload, signature] = token.split('.');

    if (!encodedHeader || !encodedPayload || !signature) {
      throw new UnauthorizedException('Invalid token.');
    }

    if (
      !this.hasValidSignature(encodedHeader, encodedPayload, signature, kind)
    ) {
      throw new UnauthorizedException('Invalid token signature.');
    }

    try {
      const header = JSON.parse(
        Buffer.from(encodedHeader, 'base64url').toString('utf8'),
      ) as { alg?: string; typ?: string };

      if (header.alg !== 'HS256' || header.typ !== 'JWT') {
        throw new UnauthorizedException('Invalid token header.');
      }

      const payload = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      ) as AccessTokenPayload | RefreshTokenPayload;

      if (!payload.sub || !payload.tenantId || !payload.typ) {
        throw new UnauthorizedException('Invalid token payload.');
      }

      if (payload.exp <= Math.floor(Date.now() / 1000)) {
        throw new UnauthorizedException('Token has expired.');
      }

      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Invalid token.');
    }
  }

  private sign(
    payload: AccessTokenPayload | RefreshTokenPayload,
    kind: TokenKind,
  ): string {
    const header = {
      alg: 'HS256',
      typ: 'JWT',
    };

    const encodedHeader = this.encodeJson(header);
    const encodedPayload = this.encodeJson(payload);
    const signature = this.signSegments(encodedHeader, encodedPayload, kind);

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  private hasValidSignature(
    encodedHeader: string,
    encodedPayload: string,
    signature: string,
    kind: TokenKind,
  ) {
    if (this.signatureMatches(encodedHeader, encodedPayload, signature, kind)) {
      return true;
    }

    // Gracefully migrate refresh tokens issued before JWT_REFRESH_SECRET was used.
    return (
      kind === 'refresh' &&
      this.getSecret('refresh') !== this.getSecret('access') &&
      this.signatureMatches(encodedHeader, encodedPayload, signature, 'access')
    );
  }

  private signatureMatches(
    encodedHeader: string,
    encodedPayload: string,
    signature: string,
    kind: TokenKind,
  ) {
    const expectedSignature = this.signSegments(
      encodedHeader,
      encodedPayload,
      kind,
    );
    const providedSignature = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);

    return (
      providedSignature.length === expected.length &&
      timingSafeEqual(providedSignature, expected)
    );
  }

  private signSegments(
    encodedHeader: string,
    encodedPayload: string,
    kind: TokenKind,
  ) {
    return createHmac('sha256', this.getSecret(kind))
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');
  }

  private encodeJson(value: Record<string, unknown>) {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }

  private getSecret(kind: TokenKind): string {
    const key = kind === 'access' ? 'JWT_ACCESS_SECRET' : 'JWT_REFRESH_SECRET';
    const secret = this.configService.get<string>(key)?.trim();

    if (kind === 'refresh' && !secret) {
      return this.getSecret('access');
    }

    if (!secret || secret.length < 16) {
      throw new Error(`${key} must be set to at least 16 characters.`);
    }

    return secret;
  }
}
