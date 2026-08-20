import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export class UpdateOperationCashCountDto {
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
   * Physical branch cash counted by the manager.
   */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000_000)
  @Type(() => Number)
  countedCash!: number;

  /**
   * Optional note explaining this particular cash count.
   */
  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;
}