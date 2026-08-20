import {
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export class StartOperationReconciliationDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  /**
   * Business date in YYYY-MM-DD format.
   * Defaults to today when omitted.
   */
  @IsOptional()
  @IsString()
  @Length(10, 10)
  date?: string;
}