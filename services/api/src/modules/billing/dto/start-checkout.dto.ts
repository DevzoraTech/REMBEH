import { IsOptional, IsString, Length } from 'class-validator';

export class StartCheckoutDto {
  /** Pro catalogue code: PRO | PRO_3M | PRO_6M */
  @IsOptional()
  @IsString()
  @Length(2, 32)
  planCode?: string;
}
