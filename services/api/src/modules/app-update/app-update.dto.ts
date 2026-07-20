import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateReleaseDto {
  @IsString()
  appName!: string;

  @IsString()
  @IsOptional()
  platform?: string;

  @IsString()
  version!: string;

  @IsInt()
  @Min(1)
  buildNumber!: number;

  @IsString()
  updateMode!: string;

  @IsBoolean()
  @IsOptional()
  forceUpdate?: boolean;

  @IsInt()
  @IsOptional()
  @Min(1)
  minSupportedBuild?: number;

  @IsString()
  @IsOptional()
  apkUrl?: string;

  @IsString()
  @IsOptional()
  apkHash?: string;

  @IsArray()
  @IsOptional()
  changelog?: string[];

  @IsString()
  @IsOptional()
  message?: string;
}

export class UpdateReleaseDto {
  @IsBoolean()
  @IsOptional()
  forceUpdate?: boolean;

  @IsInt()
  @IsOptional()
  @Min(1)
  minSupportedBuild?: number;

  @IsString()
  @IsOptional()
  apkUrl?: string;

  @IsString()
  @IsOptional()
  apkHash?: string;

  @IsArray()
  @IsOptional()
  changelog?: string[];

  @IsString()
  @IsOptional()
  message?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UploadUrlDto {
  @IsString()
  appName!: string;

  @IsString()
  @IsOptional()
  platform?: string;

  @IsString()
  version!: string;

  @IsInt()
  @Min(1)
  buildNumber!: number;
}

export class TrackDownloadDto {
  @IsString()
  app!: string;

  @IsInt()
  @Min(1)
  buildNumber!: number;

  @IsString()
  @IsOptional()
  platform?: string;
}
