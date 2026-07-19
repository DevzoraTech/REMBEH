import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

class GuarantorDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MinLength(7)
  phone?: string;
}

export class UpdateLoanApplicationDto {
  @IsOptional()
  @IsString()
  surname?: string;

  @IsOptional()
  @IsString()
  givenNames?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  nationalId?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  subCounty?: string;

  @IsOptional()
  @IsString()
  parish?: string;

  @IsOptional()
  @IsString()
  village?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  principalAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1000)
  interestRatePercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  processingFee?: number;

  @IsOptional()
  @IsString()
  collateralType?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => GuarantorDto)
  guarantor?: GuarantorDto;

  @IsOptional()
  @IsBoolean()
  termsConfirmed?: boolean;
}
