import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class SendPushTestDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  body!: string;

  @IsOptional()
  @IsString()
  href?: string;
}
