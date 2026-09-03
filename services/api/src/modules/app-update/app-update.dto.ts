import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateReleaseDto {
  @IsString()
  appName!: string;

  @IsString()
  @IsOptional()
  platform?: string;

  @IsString()
  version!: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  releaseEpoch?: number;

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

  @IsOptional()
  @IsIn(['ALL', 'SELECTED'])
  audience?: 'ALL' | 'SELECTED';

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  tenantIds?: string[];
}

export class UpdateReleaseDto {
  @IsInt()
  @IsOptional()
  @Min(1)
  releaseEpoch?: number;

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

  @IsOptional()
  @IsIn(['ALL', 'SELECTED'])
  audience?: 'ALL' | 'SELECTED';

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  tenantIds?: string[];
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
  @IsOptional()
  @Min(1)
  releaseEpoch?: number;

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

  @IsInt()
  @IsOptional()
  @Min(1)
  releaseEpoch?: number;

  @IsString()
  @IsOptional()
  platform?: string;
}

export class WhatsNewItemDto {
  @IsString()
  @Length(1, 120)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 240)
  body?: string | null;
}

export class UpdateAppUpdateScreenDto {
  @IsOptional()
  @IsString()
  @Length(0, 160)
  readyMessage?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  requiredMessage?: string | null;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  whatsNewTitle?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => WhatsNewItemDto)
  whatsNewItems?: WhatsNewItemDto[];

  @IsOptional()
  @IsIn(['NONE', 'IMAGE', 'VIDEO'])
  mediaType?: 'NONE' | 'IMAGE' | 'VIDEO';

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  mediaUrl?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  mediaStorageKey?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  mediaTitle?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 240)
  mediaBody?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 40)
  mediaCtaLabel?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  stayConnectedTitle?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 240)
  stayConnectedBody?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AppUpdateScreenMediaPresignDto {
  @IsString()
  mimeType!: string;

  @IsOptional()
  @IsString()
  fileName?: string;
}
