import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  @MinLength(20)
  token!: string;

  @IsIn(['WEB', 'ANDROID', 'IOS'])
  platform!: 'WEB' | 'ANDROID' | 'IOS';

  /** Firebase project that issued the token: WEB (rembeh-web) or MOBILE (rembeh-mobile). */
  @IsOptional()
  @IsIn(['WEB', 'MOBILE'])
  projectKey?: 'WEB' | 'MOBILE';

  @IsOptional()
  @IsString()
  deviceId?: string;
}
