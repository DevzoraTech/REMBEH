import { IsEmail, IsString, Length } from 'class-validator';

export class InviteBranchStaffDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(2, 120)
  displayName!: string;

  @IsString()
  @Length(2, 80)
  roleName!: string;
}
