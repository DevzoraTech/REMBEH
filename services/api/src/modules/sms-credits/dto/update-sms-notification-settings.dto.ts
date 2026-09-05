import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateIf,
} from 'class-validator';
import { SmsSupportContactSource } from '@prisma/client';

export class UpdateSmsNotificationSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  loanRecordedEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  paymentConfirmationEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  paymentReminderEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  overdueNoticeEnabled?: boolean;

  @IsOptional()
  @IsEnum(SmsSupportContactSource)
  supportContactSource?: SmsSupportContactSource;

  @IsOptional()
  @IsBoolean()
  supportContactLocked?: boolean;

  /**
   * Custom support number for borrower SMS.
   * Pass `null` or `""` to clear and fall back to the owner phone.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @Length(0, 32)
  @Matches(/^[\d+\s()-]*$/, {
    message: 'Support phone may only contain digits and phone punctuation.',
  })
  supportPhone?: string | null;
}
