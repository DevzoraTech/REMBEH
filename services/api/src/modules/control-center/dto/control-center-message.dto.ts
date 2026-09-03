import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class ControlCenterSendMessageDto {
  @IsIn(['EMAIL', 'SMS'])
  channel!: 'EMAIL' | 'SMS';

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  templateCode?: string;

  @IsOptional()
  @IsString()
  @Length(2, 200)
  subject?: string;

  @IsString()
  @Length(2, 1600)
  body!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  recipients?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  userIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  roleNames?: string[];

  @IsOptional()
  @IsIn([
    'ALL_USERS',
    'TENANT_USERS',
    'BRANCH_USERS',
    'TENANT_OWNERS',
    'SELECTED_USERS',
    'ROLE_USERS',
  ])
  audience?:
    | 'ALL_USERS'
    | 'TENANT_USERS'
    | 'BRANCH_USERS'
    | 'TENANT_OWNERS'
    | 'SELECTED_USERS'
    | 'ROLE_USERS';
}
