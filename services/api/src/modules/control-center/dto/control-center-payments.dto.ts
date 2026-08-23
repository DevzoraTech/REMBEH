import { IsOptional, IsString, Length } from 'class-validator';

export class ControlCenterVerifyPaymentDto {
  @IsOptional()
  @IsString()
  @Length(3, 80)
  transactionId?: string;
}

export class ControlCenterRejectPaymentDto {
  @IsString()
  @Length(3, 500)
  reason!: string;
}
