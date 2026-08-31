import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import {
  RepaymentCorrectionRequestStatus,
  RepaymentMethod,
} from '@prisma/client';

export class CreateRepaymentCorrectionRequestDto {
  @IsString()
  @Length(6, 500)
  reason!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000_000)
  requestedAmount?: number;

  @IsOptional()
  @IsEnum(RepaymentMethod)
  requestedMethod?: RepaymentMethod;

  @IsOptional()
  @IsISO8601()
  requestedPaidAt?: string;

  @IsOptional()
  @IsString()
  @Length(0, 240)
  requestedNote?: string;
}

export class ReviewRepaymentCorrectionRequestDto {
  @IsEnum(RepaymentCorrectionRequestStatus)
  status!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsBoolean()
  officerCanEdit?: boolean;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  feedback?: string;
}

export class ApplyRepaymentCorrectionDto {
  @IsString()
  @Length(6, 500)
  reason!: string;

  @IsOptional()
  @IsUUID()
  correctionRequestId?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000_000)
  amount?: number;

  @IsOptional()
  @IsEnum(RepaymentMethod)
  method?: RepaymentMethod;

  @IsOptional()
  @IsISO8601()
  paidAt?: string;

  @IsOptional()
  @IsString()
  @Length(0, 240)
  note?: string;
}
