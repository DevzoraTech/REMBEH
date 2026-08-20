import {
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export class SubmitOperationReconciliationDto {
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

  /**
   * Final manager note for the reconciliation / close.
   *
   * The persisted reconciliation countedCash will be used as the
   * authoritative closing balance.
   */
  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;

  /**
   * Required when the final variance is negative.
   *
   * This identifies the person who will account for the branch-close shortage.
   */
  @IsOptional()
  @IsUUID()
  shortageResponsibleUserId?: string;
}