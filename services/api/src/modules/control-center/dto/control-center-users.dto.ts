import { IsIn, IsOptional, IsString, Length } from 'class-validator';

export class ControlCenterUpdateUserStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED', 'INACTIVE'])
  status!: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';

  @IsOptional()
  @IsString()
  @Length(0, 500)
  reason?: string;
}
