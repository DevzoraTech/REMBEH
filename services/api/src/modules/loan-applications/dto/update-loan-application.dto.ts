import { ApplicantGender } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
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
  @IsEnum(ApplicantGender)
  gender?: ApplicantGender;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

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

  /** Agent-picked repayment start when branch policy allows date pick. */
  @IsOptional()
  @IsDateString()
  paymentStartDate?: string;
}
