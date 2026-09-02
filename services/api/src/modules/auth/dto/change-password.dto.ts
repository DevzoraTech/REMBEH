import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Current password must be at least 8 characters.' })
  @MaxLength(128)
  currentPassword?: string;

  @IsString()
  @MinLength(8, { message: 'New password must be at least 8 characters.' })
  @MaxLength(128)
  newPassword!: string;

  @IsString()
  @MinLength(8, { message: 'Confirm password must be at least 8 characters.' })
  @MaxLength(128)
  confirmPassword!: string;
}
