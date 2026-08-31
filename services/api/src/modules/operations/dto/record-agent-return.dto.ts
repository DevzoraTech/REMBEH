import { Type } from 'class-transformer';
import {
  CashShortageReason,
} from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export class RecordAgentReturnDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  /** YYYY-MM-DD; defaults to today. */
  @IsOptional()
  @IsString()
  @Length(10, 10)
  date?: string;

  @IsUUID()
  agentId!: string;

  @IsNumber({
    maxDecimalPlaces: 2,
  })
  @Min(0)
  @Max(10_000_000_000)
  @Type(() => Number)
  amountReturned!: number;

  /**
   * Required when amount returned is lower than
   * the system-calculated expected handover.
   */
  @IsOptional()
  @IsEnum(CashShortageReason)
  shortageReason?: CashShortageReason;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;
}

export class RecordOwnAgentReturnDto {
  /** YYYY-MM-DD; defaults to today. */
  @IsOptional()
  @IsString()
  @Length(10, 10)
  date?: string;

  @IsNumber({
    maxDecimalPlaces: 2,
  })
  @Min(0)
  @Max(10_000_000_000)
  @Type(() => Number)
  amountReturned!: number;

  /**
   * Required when amount returned is lower than
   * the system-calculated expected handover.
   */
  @IsOptional()
  @IsEnum(CashShortageReason)
  shortageReason?: CashShortageReason;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;
}
