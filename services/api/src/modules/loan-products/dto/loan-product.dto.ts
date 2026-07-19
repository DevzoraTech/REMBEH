import { PaymentStartPolicyType } from '@prisma/client';
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
