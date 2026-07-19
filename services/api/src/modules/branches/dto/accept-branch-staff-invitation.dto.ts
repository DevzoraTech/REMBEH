import { IsString, Matches, MinLength } from 'class-validator';

export class AcceptBranchStaffInvitationDto {
  @IsString()
  @MinLength(24)
  token!: string;

  @IsString()
  @Matches(/^\+[0-9 ()-]{8,24}$/, {
    message: 'phone must be a valid international phone number',
  })
  phone!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
