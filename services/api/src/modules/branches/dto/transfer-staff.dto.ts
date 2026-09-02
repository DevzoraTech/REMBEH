import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class TransferStaffDto {
  @IsUUID()
  targetBranchId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;
}
