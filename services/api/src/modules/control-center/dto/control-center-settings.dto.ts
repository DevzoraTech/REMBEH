import { IsOptional, IsString, Length } from 'class-validator';

export class ControlCenterUpdateMessageTemplateDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  subject?: string;

  @IsString()
  @Length(2, 1600)
  body!: string;
}
