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
