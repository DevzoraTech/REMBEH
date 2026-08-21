import {
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export class UpdateOperationReconciliationNotesDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsString()
  @Length(10, 10)
  date?: string;

  @IsString()
  @Length(0, 500)
  notes!: string;
}