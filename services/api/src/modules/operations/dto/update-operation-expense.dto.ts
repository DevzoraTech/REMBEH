import { BranchOperationExpenseCategory } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class UpdateOperationExpenseDto {
  @IsOptional()
  @IsEnum(BranchOperationExpenseCategory)
  category?: BranchOperationExpenseCategory;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(1_000_000_000)
  @Type(() => Number)
  amount?: number;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;
}
