import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsISO8601,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class SubmitLoanApplicationDto {
  /** Operating day that owns this application when a report was returned. */
  @IsOptional()
  @IsISO8601({ strict: true })
  operationDate?: string;

  /**
   * Amount physically handed to the borrower now.
   * Defaults to full principal for the existing one-step issue flow.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000_000)
  initialDisbursementAmount?: number;

  /**
   * Portion of initialDisbursementAmount funded from repayments collected by
   * the same staff member today. The remainder is assigned float.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  collectedRepaymentsAmount?: number;

  @IsOptional()
  @IsString()
  @Length(0, 240)
  disbursementNote?: string;
}
