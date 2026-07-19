import { IsOptional, IsString, MinLength } from 'class-validator';

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

  @IsOptional()
  @IsString()
  country?: string;
}
