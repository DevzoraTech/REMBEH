import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class ControlCenterFeatureAccessDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  @Length(0, 240)
  reason?: string | null;
}
