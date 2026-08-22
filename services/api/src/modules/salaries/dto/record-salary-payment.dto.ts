import { SalaryPaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class RecordSalaryPaymentDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10_000_000_000)
  @Type(() => Number)
  amount!: number;

  @IsEnum(SalaryPaymentMethod)
  method!: SalaryPaymentMethod;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  referenceNote?: string;
}
