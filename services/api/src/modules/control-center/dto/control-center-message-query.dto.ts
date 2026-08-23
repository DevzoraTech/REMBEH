import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ControlCenterMessageQueryDto {
  @IsOptional()
  @IsIn(['EMAIL', 'SMS'])
  channel?: 'EMAIL' | 'SMS';

  @IsOptional()
  @IsIn(['SENT', 'FAILED', 'SKIPPED'])
  status?: 'SENT' | 'FAILED' | 'SKIPPED';

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
