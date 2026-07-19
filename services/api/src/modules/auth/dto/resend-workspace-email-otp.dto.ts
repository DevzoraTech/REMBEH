import { IsUUID } from 'class-validator';

export class ResendWorkspaceEmailOtpDto {
  @IsUUID()
  challengeId!: string;
}
