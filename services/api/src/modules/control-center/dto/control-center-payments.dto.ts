import { IsIn, IsOptional, IsString, Length } from 'class-validator';

export class ControlCenterVerifyPaymentDto {
  @IsOptional()
  @IsIn(['subscription', 'sms'])
  kind?: 'subscription' | 'sms';

  @IsOptional()
  @IsString()
  @Length(3, 80)
  transactionId?: string;
}

export class ControlCenterRejectPaymentDto {
  @IsOptional()
  @IsIn(['subscription', 'sms'])
  kind?: 'subscription' | 'sms';

  @IsString()
  @Length(3, 500)
  reason!: string;
}
