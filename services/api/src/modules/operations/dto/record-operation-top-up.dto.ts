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

export class RecordOperationTopUpDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  /** YYYY-MM-DD; defaults to today. */
  @IsOptional()
  @IsString()
  @Length(10, 10)
  date?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(10_000_000_000)
  @Type(() => Number)
  amount!: number;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;
}
