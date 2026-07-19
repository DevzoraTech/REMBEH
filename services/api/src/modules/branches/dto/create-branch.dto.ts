import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

class WorkingDayDto {
  @IsIn(DAYS)
  day!: (typeof DAYS)[number];

  @IsString()
  @Matches(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
  opensAt!: string;

  @IsString()
  @Matches(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
  closesAt!: string;

  @IsOptional()
  @IsBoolean()
  closed?: boolean;
}

class WorkingHoursDto {
  @IsString()
  @Length(2, 80)
  timezone!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkingDayDto)
  days!: WorkingDayDto[];
}

export class CreateBranchDto {
  @IsString()
  @Length(2, 120)
  branchName!: string;

  @IsString()
  @Length(5, 220)
  branchAddress!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  gpsLatitude?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  gpsLongitude?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\+[0-9 ()-]{8,24}$/, {
    message: 'branchPhone must be a valid international phone number',
  })
  branchPhone?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => WorkingHoursDto)
  workingHours?: WorkingHoursDto;
}
