import { IsOptional, IsString, Length } from 'class-validator';

export class ReverseSalaryPaymentDto {
  @IsOptional()
  @IsString()
  @Length(0, 500)
  reason?: string;
}
