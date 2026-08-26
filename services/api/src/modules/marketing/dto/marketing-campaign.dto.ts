import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class MarketingCampaignDto {
  @IsString()
  @Length(2, 90)
  title!: string;

  @IsString()
  @Length(2, 600)
  body!: string;

  @IsOptional()
  @IsString()
  @Length(0, 42)
  ctaLabel?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  ctaUrl?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  mediaUrl?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  mediaStorageKey?: string | null;

  @IsOptional()
  @IsIn(['NONE', 'IMAGE', 'VIDEO'])
  mediaType?: 'NONE' | 'IMAGE' | 'VIDEO';

  @IsOptional()
  @IsIn(['MOBILE_HEADER'])
  placement?: 'MOBILE_HEADER';

  @IsIn([
    'ALL_USERS',
    'TENANT_USERS',
    'BRANCH_USERS',
    'TENANT_OWNERS',
    'ROLE_USERS',
    'SELECTED_USERS',
  ])
  audience!:
    | 'ALL_USERS'
    | 'TENANT_USERS'
    | 'BRANCH_USERS'
    | 'TENANT_OWNERS'
    | 'ROLE_USERS'
    | 'SELECTED_USERS';

  @IsOptional()
  @IsIn(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'])
  status?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

  @IsOptional()
  @IsString()
  tenantId?: string | null;

  @IsOptional()
  @IsString()
  branchId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  roleNames?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  userIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  priority?: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string | null;
}

export class UpdateMarketingCampaignDto {
  @IsOptional()
  @IsString()
  @Length(2, 90)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(2, 600)
  body?: string;

  @IsOptional()
  @IsString()
  @Length(0, 42)
  ctaLabel?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  ctaUrl?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  mediaUrl?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  mediaStorageKey?: string | null;

  @IsOptional()
  @IsIn(['NONE', 'IMAGE', 'VIDEO'])
  mediaType?: 'NONE' | 'IMAGE' | 'VIDEO';

  @IsOptional()
  @IsIn(['MOBILE_HEADER'])
  placement?: 'MOBILE_HEADER';

  @IsOptional()
  @IsIn([
    'ALL_USERS',
    'TENANT_USERS',
    'BRANCH_USERS',
    'TENANT_OWNERS',
    'ROLE_USERS',
    'SELECTED_USERS',
  ])
  audience?:
    | 'ALL_USERS'
    | 'TENANT_USERS'
    | 'BRANCH_USERS'
    | 'TENANT_OWNERS'
    | 'ROLE_USERS'
    | 'SELECTED_USERS';

  @IsOptional()
  @IsIn(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'])
  status?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

  @IsOptional()
  @IsString()
  tenantId?: string | null;

  @IsOptional()
  @IsString()
  branchId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  roleNames?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  userIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  priority?: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string | null;
}

export class MarketingCampaignStatusDto {
  @IsIn(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'])
  status!: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
}

export class MarketingMediaPresignDto {
  @IsString()
  @Length(3, 120)
  mimeType!: string;

  @IsOptional()
  @IsString()
  @Length(0, 160)
  fileName?: string;
}
