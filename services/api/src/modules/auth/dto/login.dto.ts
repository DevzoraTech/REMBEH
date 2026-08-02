import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  /** Stable device identifier (installation id / browser fingerprint). */
  @IsOptional()
  @IsString()
  deviceId?: string;

  /** Human-readable device label, e.g. "iPhone 13". */
  @IsOptional()
  @IsString()
  deviceName?: string;

  /** Display type, e.g. "Mobile App (iOS)" or "Web App". */
  @IsOptional()
  @IsString()
  deviceType?: string;

  /** Raw platform: IOS | ANDROID | WEB. */
  @IsOptional()
  @IsString()
  platform?: string;
}
