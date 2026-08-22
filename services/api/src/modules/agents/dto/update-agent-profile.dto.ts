import { IsEmail, IsOptional, IsString, Length } from 'class-validator';

export class UpdateAgentProfileDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  displayName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Length(0, 32)
  phone?: string;
}
