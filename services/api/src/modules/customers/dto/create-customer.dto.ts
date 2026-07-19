import { IsEmail, IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  @Length(2, 120)
  fullName!: string;

  @IsString()
  @Matches(/^\+[0-9 ()-]{8,24}$/, {
    message: 'phone must be a valid international phone number',
  })
  phone!: string;

  @IsOptional()
  @IsString()
  @Length(4, 40)
  nationalId?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
