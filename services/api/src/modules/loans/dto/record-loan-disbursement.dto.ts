import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class RecordLoanDisbursementDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000_000)
  amount!: number;

  /**
   * Portion of amount funded from repayments already collected by this
   * staff member today. The remainder is funded from assigned float.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  collectedRepaymentsAmount?: number;

  /** Client-generated id for offline/idempotent submissions. */
  @IsOptional()
  @IsString()
  @Length(1, 120)
  localId?: string;

  /**
   * Staff member who physically issued the cash. Defaults to the
   * authenticated user for offline/mobile submissions.
   */
  @IsOptional()
  @IsString()
  @Length(1, 120)
  issuedByUserId?: string;

  @IsOptional()
  @IsString()
  @Length(0, 240)
  note?: string;

  /** ISO timestamp; defaults to now. */
  @IsOptional()
  @IsDateString()
  disbursedAt?: string;
}
