import { IsString, Length, Matches, MinLength } from 'class-validator';

export class CompleteOAuthWorkspaceDto {
  @IsString()
  @MinLength(20)
  onboardingToken!: string;

  @IsString()
  @Length(2, 120)
  businessName!: string;

  @IsString()
  @Length(2, 80)
  country!: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/, {
    message: 'currency must be a 3-letter ISO currency code',
  })
  currency!: string;

  @IsString()
  @Length(2, 120)
  ownerName!: string;

  @IsString()
  @Matches(/^\+[0-9 ()-]{8,24}$/, {
    message: 'phone must be a valid international phone number',
  })
  phone!: string;
}
