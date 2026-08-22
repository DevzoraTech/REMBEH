import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class ControlCenterPricingAmountDto {
  @IsString()
  @Length(2, 40)
  planCode!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000_000)
  @Type(() => Number)
  amount!: number;
}

export class ControlCenterSavePricingDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ControlCenterPricingAmountDto)
  prices!: ControlCenterPricingAmountDto[];

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveUntil?: string;

  @IsString()
  @Length(3, 500)
  reason!: string;
}
