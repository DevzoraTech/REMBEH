import {
  IsDateString,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class LegacyLoanCorrectionDto {
  @IsOptional()
  @IsString()
  @Length(2, 160)
  customerFullName?: string;

  @IsOptional()
  @IsString()
  @Length(3, 48)
  phone?: string;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  nationalId?: string | null;

  @IsOptional()
  @IsEmail()
  @Length(0, 160)
  email?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  principalAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  outstandingBalance?: number;

  @IsOptional()
  @IsDateString()
  loanStartDate?: string;

  @IsOptional()
  @IsDateString()
  paymentStartDate?: string;

  @IsOptional()
  @IsIn(['CURRENT', 'IN_ARREARS', 'RESTRUCTURED', 'WRITTEN_OFF', 'CLOSED'])
  status?: 'CURRENT' | 'IN_ARREARS' | 'RESTRUCTURED' | 'WRITTEN_OFF' | 'CLOSED';

  @IsString()
  @Length(4, 240)
  reason!: string;
}

export class LegacyLoanDeleteDto {
  @IsString()
  @Length(4, 240)
  reason!: string;
}
