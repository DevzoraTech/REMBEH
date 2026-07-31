import { IsOptional, IsString, MaxLength } from 'class-validator';

export class VerifyFlutterwavePaymentDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  transactionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  txRef?: string;
}
