import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewOperationReportDto {
  @IsOptional()
  @IsString()
  @MaxLength(800)
  notes?: string;
}
