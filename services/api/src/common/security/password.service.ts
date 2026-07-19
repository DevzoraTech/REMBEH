import { Injectable } from '@nestjs/common';
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

@Injectable()
export class PasswordService {
  async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('base64url');
    const derivedKey = (await scrypt(password, salt, 64)) as Buffer;

    return `scrypt$${salt}$${derivedKey.toString('base64url')}`;
  }

  async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    const [algorithm, salt, hash] = storedHash.split('$');

    if (algorithm !== 'scrypt' || !salt || !hash) {
      return false;
    }

    const candidate = (await scrypt(password, salt, 64)) as Buffer;
    const expected = Buffer.from(hash, 'base64url');

    return (
      candidate.length === expected.length &&
      timingSafeEqual(candidate, expected)
    );
  }
}
