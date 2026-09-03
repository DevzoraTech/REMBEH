import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { normalizeInternationalPhoneNumber } from '../../../common/security/identity-normalization';

export class CreateCustomerDto {
  @IsString()
  @Length(2, 120)
  fullName!: string;

  @Transform(({ value }) =>
    typeof value === 'string'
      ? normalizeInternationalPhoneNumber(value)
      : value,
  )
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, {
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
