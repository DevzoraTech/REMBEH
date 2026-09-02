import { CustomerVoidDisposition } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class VoidCustomerDto {
  @IsEnum(CustomerVoidDisposition)
  disposition!: CustomerVoidDisposition;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
