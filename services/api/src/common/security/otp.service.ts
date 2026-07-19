import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

@Injectable()
export class OtpService {
  constructor(private readonly configService: ConfigService) {}

  generateCode(): string {
    return randomInt(100000, 1000000).toString();
  }

  hashCode(code: string): string {
    const secret =
      this.configService.get<string>('JWT_ACCESS_SECRET') ?? 'rembeh-local-dev';

    return createHash('sha256')
      .update(`${this.normalizeCode(code)}:${secret}`)
      .digest('hex');
  }

  verifyCode(code: string, storedHash: string): boolean {
    const candidate = Buffer.from(this.hashCode(code));
    const expected = Buffer.from(storedHash);

    return (
      candidate.length === expected.length &&
      timingSafeEqual(candidate, expected)
    );
  }

  normalizeCode(code: string): string {
    return code.replace(/\s+/g, '').trim();
  }
}
