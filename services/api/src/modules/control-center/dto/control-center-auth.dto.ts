import { IsEmail, IsString, Length } from 'class-validator';

export class ControlCenterLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(8, 128)
  password!: string;
}

export class ControlCenterSetupDto extends ControlCenterLoginDto {
  @IsString()
  @Length(2, 120)
  displayName!: string;
}

export class ControlCenterChangePasswordDto {
  @IsString()
  @Length(8, 128, { message: 'Current password must be at least 8 characters.' })
  currentPassword!: string;

  @IsString()
  @Length(8, 128, { message: 'New password must be at least 8 characters.' })
  newPassword!: string;

  @IsString()
  @Length(8, 128, { message: 'Confirm password must be at least 8 characters.' })
  confirmPassword!: string;
}
