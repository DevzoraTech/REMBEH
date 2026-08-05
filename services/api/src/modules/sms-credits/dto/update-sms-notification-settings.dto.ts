import { IsBoolean, IsOptional } from 'class-validator';

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
}
