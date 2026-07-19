import { ApplicantGender } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class VerifyApplicantDto {
  @IsString()
  @MinLength(1)
  surname!: string;

  @IsString()
  @MinLength(1)
  givenNames!: string;

  @IsString()
  @MinLength(7)
  phone!: string;

  @IsString()
  @MinLength(5)
  nationalId!: string;

  @IsEnum(ApplicantGender)
  gender!: ApplicantGender;

  /** YYYY-MM-DD — required for Smile ID / KYC matching. */
  @IsDateString()
  dateOfBirth!: string;

  @IsOptional()
  @IsString()
  country?: string;
}
