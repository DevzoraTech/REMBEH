import { Type } from 'class-transformer';
import { BranchOperationBankingType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export class RecordOperationBankingDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(10_000_000_000)
  @Type(() => Number)
  amount!: number;

  @IsOptional()
  @IsEnum(BranchOperationBankingType)
  type?: BranchOperationBankingType;

  @IsOptional()
  @IsString()
  @Length(0, 120)
  reference?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  receiptStorageKey?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  receiptMimeType?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  receiptFileName?: string;
}

export class PresignOperationBankingReceiptDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsString()
  @Length(1, 120)
  mimeType!: string;

  @IsString()
  @Length(1, 255)
  fileName!: string;
}
