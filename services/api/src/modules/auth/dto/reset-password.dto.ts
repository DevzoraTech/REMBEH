import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsUUID()
  challengeId!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(6)
  code!: string;

  @IsString()
  @MinLength(8, { message: 'New password must be at least 8 characters.' })
  @MaxLength(128)
  newPassword!: string;

  @IsString()
  @MinLength(8, { message: 'Confirm password must be at least 8 characters.' })
  @MaxLength(128)
  confirmPassword!: string;
}
