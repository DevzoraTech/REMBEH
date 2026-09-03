import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
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
}
