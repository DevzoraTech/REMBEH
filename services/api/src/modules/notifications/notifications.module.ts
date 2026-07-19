import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { SmsService } from './sms.service';

@Module({
  providers: [NotificationsService, SmsService],
  exports: [NotificationsService, SmsService],
})
export class NotificationsModule {}
