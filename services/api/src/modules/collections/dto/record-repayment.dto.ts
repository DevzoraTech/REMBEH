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
import { RepaymentMethod } from '@prisma/client';

export class RecordRepaymentDto {
  @IsUUID()
  loanId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000_000)
  amount!: number;

  @IsOptional()
  @IsEnum(RepaymentMethod)
  method?: RepaymentMethod;

  @IsOptional()
  @IsString()
  @Length(0, 240)
  note?: string;

  /** ISO timestamp; defaults to now. */
  @IsOptional()
  @IsString()
  paidAt?: string;
}
