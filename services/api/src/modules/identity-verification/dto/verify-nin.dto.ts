import { IsOptional, IsString, MinLength } from 'class-validator';

export class VerifyNinDto {
  @IsString()
  @MinLength(5)
  nationalId!: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;
}
