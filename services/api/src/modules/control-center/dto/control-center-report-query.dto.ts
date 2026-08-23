import { IsIn, IsOptional, IsString } from 'class-validator';

export class ControlCenterReportQueryDto {
  @IsOptional()
  @IsIn(['30_DAYS', '90_DAYS', '180_DAYS', 'THIS_YEAR', 'CUSTOM'])
  range?: '30_DAYS' | '90_DAYS' | '180_DAYS' | 'THIS_YEAR' | 'CUSTOM';

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}
