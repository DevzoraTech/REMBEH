import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export enum ControlCenterMerchantPaymentProvider {
  MTN_MOMO = 'MTN_MOMO',
  AIRTEL_MONEY = 'AIRTEL_MONEY',
}

export class ControlCenterUpdateMerchantPaymentProviderDto {
  @IsString()
  @Length(3, 40)
  merchantCode!: string;

  @IsString()
  @Length(2, 120)
  accountName!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class ControlCenterUpdateMessageTemplateDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  subject?: string;

  @IsString()
  @Length(2, 1600)
  body!: string;
}

export class ControlCenterCreateOperatorSmsContactDto {
  @IsString()
  @Length(2, 40)
  name!: string;

  @IsString()
  @Length(9, 20)
  phone!: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ControlCenterUpdateOperatorSmsContactDto {
  @IsOptional()
  @IsString()
  @Length(2, 40)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(9, 20)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
