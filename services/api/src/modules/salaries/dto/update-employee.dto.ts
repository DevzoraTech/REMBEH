import { EmployeeStatus, SalaryPaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  fullName?: string;

  @IsOptional()
  @IsString()
  @Length(6, 32)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @Length(3, 160)
  email?: string;

  @IsOptional()
  @IsString()
  @Length(3, 80)
  ninNumber?: string;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  roleName?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000_000)
  @Type(() => Number)
  monthlySalary?: number;

  @IsOptional()
  @IsDateString()
  dateJoined?: string;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @IsOptional()
  @IsEnum(SalaryPaymentMethod)
  paymentMethod?: SalaryPaymentMethod;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  paymentProvider?: string;

  @IsOptional()
  @IsString()
  @Length(0, 120)
  paymentAccountName?: string;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  paymentAccountNumber?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;
}
