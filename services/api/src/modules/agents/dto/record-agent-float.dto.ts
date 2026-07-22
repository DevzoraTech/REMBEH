import {
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class RecordAgentFloatDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  amountGiven!: number;

  /** YYYY-MM-DD; defaults to today. */
  @IsOptional()
  @IsString()
  @Length(10, 10)
  date?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;
}
