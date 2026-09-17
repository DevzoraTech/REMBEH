import { IsString, Length } from 'class-validator';

export class VoidRepaymentDto {
  @IsString()
  @Length(6, 500)
  reason!: string;
}
