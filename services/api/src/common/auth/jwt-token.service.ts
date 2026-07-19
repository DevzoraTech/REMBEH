import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AccessTokenPayload } from './authenticated-user';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

@Injectable()
export class JwtTokenService {
  constructor(private readonly configService: ConfigService) {}

  issueAccessToken(input: { userId: string; tenantId: string }) {
    const now = Math.floor(Date.now() / 1000);
    const payload: AccessTokenPayload = {
      typ: 'access',
      sub: input.userId,
      tenantId: input.tenantId,
      iat: now,
      exp: now + ACCESS_TOKEN_TTL_SECONDS,
    };

    return {
      accessToken: this.sign(payload),
      expiresAt: new Date(payload.exp * 1000).toISOString(),
    };
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    const [encodedHeader, encodedPayload, signature] = token.split('.');

    if (!encodedHeader || !encodedPayload || !signature) {
      throw new UnauthorizedException('Invalid access token.');
    }

    const expectedSignature = this.signSegments(encodedHeader, encodedPayload);
    const providedSignature = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);

    if (
      providedSignature.length !== expected.length ||
      !timingSafeEqual(providedSignature, expected)
    ) {
      throw new UnauthorizedException('Invalid access token signature.');
    }

    try {
      const header = JSON.parse(
        Buffer.from(encodedHeader, 'base64url').toString('utf8'),
      ) as { alg?: string; typ?: string };

      if (header.alg !== 'HS256' || header.typ !== 'JWT') {
        throw new UnauthorizedException('Invalid access token header.');
      }

      const payload = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      ) as AccessTokenPayload;

      if (!payload.sub || !payload.tenantId) {
        throw new UnauthorizedException('Invalid access token payload.');
      }

      if (payload.typ !== 'access') {
        throw new UnauthorizedException('Invalid token type.');
      }

      if (payload.exp <= Math.floor(Date.now() / 1000)) {
        throw new UnauthorizedException('Access token has expired.');
      }

      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Invalid access token.');
    }
  }

  private sign(payload: AccessTokenPayload): string {
    const header = {
      alg: 'HS256',
      typ: 'JWT',
    };

    const encodedHeader = this.encodeJson(header);
    const encodedPayload = this.encodeJson(payload);
    const signature = this.signSegments(encodedHeader, encodedPayload);

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  private signSegments(encodedHeader: string, encodedPayload: string) {
    return createHmac('sha256', this.getSecret())
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');
  }

  private encodeJson(value: Record<string, unknown>) {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }

  private getSecret() {
    const secret = this.configService.get<string>('JWT_ACCESS_SECRET');

    if (!secret || secret.length < 16) {
      throw new Error(
        'JWT_ACCESS_SECRET must be set to at least 16 characters.',
      );
    }

    return secret;
  }
}
