import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class SendRepaymentSmsDto {
  @IsOptional()
  @IsBoolean()
  resend?: boolean;
}

export class BulkRepaymentSmsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  repaymentIds!: string[];

  @IsOptional()
  @IsBoolean()
  resendFailed?: boolean;
}
