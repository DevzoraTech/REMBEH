import { Module, forwardRef } from '@nestjs/common';
import { AuthContextModule } from '../../common/auth/auth-context.module';
import { DatabaseModule } from '../../database/database.module';
import { BillingModule } from '../billing/billing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SmsCreditsController } from './sms-credits.controller';
import { SmsCreditsService } from './sms-credits.service';
import { SmsNotificationSettingsService } from './sms-notification-settings.service';

@Module({
  imports: [
    AuthContextModule,
    DatabaseModule,
    NotificationsModule,
    forwardRef(() => BillingModule),
  ],
  controllers: [SmsCreditsController],
  providers: [SmsCreditsService, SmsNotificationSettingsService],
  exports: [SmsCreditsService, SmsNotificationSettingsService],
})
export class SmsCreditsModule {}
