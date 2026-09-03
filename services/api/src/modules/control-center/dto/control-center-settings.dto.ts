import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

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

export class ControlCenterCreateOperatorSmsContactDto {
  @IsString()
  @Length(2, 40)
  name!: string;

  @IsString()
  @Length(9, 20)
  phone!: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ControlCenterUpdateOperatorSmsContactDto {
  @IsOptional()
  @IsString()
  @Length(2, 40)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(9, 20)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
