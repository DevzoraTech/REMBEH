import { IsOptional, IsString, Length } from 'class-validator';

export class VoidOperationExpenseDto {
  @IsOptional()
  @IsString()
  @Length(0, 500)
  reason?: string;
}
