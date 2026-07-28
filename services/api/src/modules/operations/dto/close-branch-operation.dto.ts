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

export class CloseBranchOperationDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  /** YYYY-MM-DD; defaults to today. */
  @IsOptional()
  @IsString()
  @Length(10, 10)
  date?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000_000)
  @Type(() => Number)
  countedCash!: number;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;
}
