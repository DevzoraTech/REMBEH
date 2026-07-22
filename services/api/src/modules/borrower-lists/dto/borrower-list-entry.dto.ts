import { BorrowerListType } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateBorrowerListEntryDto {
  @IsEnum(BorrowerListType)
  type!: BorrowerListType;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName?: string;

  @IsString()
  @MinLength(5)
  @MaxLength(40)
  nationalId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class UpdateBorrowerListEntryDto {
  @IsOptional()
  @IsEnum(BorrowerListType)
  type?: BorrowerListType;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
