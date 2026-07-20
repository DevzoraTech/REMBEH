import {
  LoanInterestType,
  LoanRepaymentFrequency,
  LoanTermUnit,
  PaymentStartPolicyType,
} from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateLoanRateOptionDto {
  @IsString()
  @Length(1, 80)
  label!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1000)
  interestRatePercent!: number;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateLoanRateOptionDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  label?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1000)
  interestRatePercent?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateLoanPeriodOptionDto {
  @IsString()
  @Length(1, 80)
  label!: string;

  @IsInt()
  @Min(1)
  @Max(3650)
  durationDays!: number;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateLoanPeriodOptionDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  label?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  durationDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpsertPaymentStartPolicyDto {
  @IsEnum(PaymentStartPolicyType)
  policyType!: PaymentStartPolicyType;

  @ValidateIf((dto: UpsertPaymentStartPolicyDto) => dto.policyType === 'AFTER_N_DAYS')
  @IsInt()
  @Min(1)
  @Max(365)
  afterDays?: number;

  @IsOptional()
  @IsBoolean()
  allowAgentDatePick?: boolean;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class UpsertLoanFinePolicyDto {
  /** Days after maturity (and between recurring fines). */
  @IsInt()
  @Min(1)
  @Max(3650)
  finePeriodDays!: number;

  /** Fixed amount added to outstanding each fine period. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fineAmount!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class CreateLoanProductTemplateDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1000)
  interestRatePercent!: number;

  @IsOptional()
  @IsEnum(LoanInterestType)
  interestType?: LoanInterestType;

  @IsInt()
  @Min(1)
  @Max(3650)
  termValue!: number;

  @IsEnum(LoanTermUnit)
  termUnit!: LoanTermUnit;

  @IsEnum(LoanRepaymentFrequency)
  repaymentFrequency!: LoanRepaymentFrequency;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  processingFeePercent!: number;

  /** Penalty % of original principal per fine period after maturity. */
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1000)
  penaltyRatePercent!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  finePeriodDays?: number;

  @IsOptional()
  @IsEnum(PaymentStartPolicyType)
  paymentStartPolicy?: PaymentStartPolicyType;

  @ValidateIf(
    (dto: CreateLoanProductTemplateDto) =>
      dto.paymentStartPolicy === 'AFTER_N_DAYS',
  )
  @IsInt()
  @Min(1)
  @Max(365)
  paymentStartDelayDays?: number;

  @IsOptional()
  @IsBoolean()
  allowAgentDatePick?: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minLoanAmount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maxLoanAmount?: number;

  @IsOptional()
  @IsString()
  @Length(0, 4000)
  notes?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateLoanProductTemplateDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1000)
  interestRatePercent?: number;

  @IsOptional()
  @IsEnum(LoanInterestType)
  interestType?: LoanInterestType;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  termValue?: number;

  @IsOptional()
  @IsEnum(LoanTermUnit)
  termUnit?: LoanTermUnit;

  @IsOptional()
  @IsEnum(LoanRepaymentFrequency)
  repaymentFrequency?: LoanRepaymentFrequency;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  processingFeePercent?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1000)
  penaltyRatePercent?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  finePeriodDays?: number;

  @IsOptional()
  @IsEnum(PaymentStartPolicyType)
  paymentStartPolicy?: PaymentStartPolicyType;

  @IsOptional()
  @ValidateIf(
    (dto: UpdateLoanProductTemplateDto) =>
      dto.paymentStartPolicy === 'AFTER_N_DAYS',
  )
  @IsInt()
  @Min(1)
  @Max(365)
  paymentStartDelayDays?: number | null;

  @IsOptional()
  @IsBoolean()
  allowAgentDatePick?: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minLoanAmount?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maxLoanAmount?: number | null;

  @IsOptional()
  @IsString()
  @Length(0, 4000)
  notes?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
