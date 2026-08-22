import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
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
  @IsIn(['TENANT_USERS', 'BRANCH_USERS', 'TENANT_OWNERS'])
  audience?: 'TENANT_USERS' | 'BRANCH_USERS' | 'TENANT_OWNERS';
}
