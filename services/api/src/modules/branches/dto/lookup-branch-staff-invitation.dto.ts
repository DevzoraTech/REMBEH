import { IsString, MinLength } from 'class-validator';

export class LookupBranchStaffInvitationDto {
  @IsString()
  @MinLength(24)
  token!: string;
}
