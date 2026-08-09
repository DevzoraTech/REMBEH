import { IsEnum, IsOptional, IsString, Length } from 'class-validator';

export enum ManualMerchantPaymentProvider {
  MTN_MOMO = 'MTN_MOMO',
  AIRTEL_MONEY = 'AIRTEL_MONEY',
}

export class SubmitManualMerchantPaymentDto {
  /** Pro catalogue code: PRO | PRO_3M | PRO_6M */
  @IsOptional()
  @IsString()
  @Length(2, 32)
  planCode?: string;

  @IsEnum(ManualMerchantPaymentProvider)
  provider!: ManualMerchantPaymentProvider;

  @IsString()
  @Length(3, 80)
  transactionId!: string;
}
