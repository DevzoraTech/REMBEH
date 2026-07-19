import { IsString, IsUUID, Length, Matches } from 'class-validator';

export class VerifyWorkspaceEmailDto {
  @IsUUID()
  challengeId!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^[0-9]{6}$/)
  code!: string;
}
