import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  MAX_TRIAL_DAYS,
  MIN_TRIAL_DAYS,
} from '../../billing/billing.permissions';

export class ControlCenterUpdateTrialDto {
  /**
   * Custom trial length in days. Pass `null` to clear the override and use
   * the platform default (currently 30 days).
   */
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(MIN_TRIAL_DAYS)
  @Max(MAX_TRIAL_DAYS)
  durationDays!: number | null;

  @IsOptional()
  @IsString()
  @Length(0, 240)
  reason?: string | null;
}
