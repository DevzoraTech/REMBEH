import { LoanApplicationMediaType } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class LegacyLoanMediaPresignDto {
  @IsEnum(LoanApplicationMediaType)
  mediaType!: LoanApplicationMediaType;

  @IsString()
  @MinLength(3)
  mimeType!: string;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsString()
  extension?: string;
}

export class LegacyLoanMediaConfirmDto {
  @IsEnum(LoanApplicationMediaType)
  mediaType!: LoanApplicationMediaType;

  @IsString()
  @MinLength(3)
  storageKey!: string;

  @IsString()
  @MinLength(3)
  mimeType!: string;

  @IsInt()
  @Min(1)
  byteSize!: number;

  @IsOptional()
  @IsString()
  checksum?: string;

  @IsOptional()
  @IsString()
  fileName?: string;
}
