import { Module } from '@nestjs/common';
import { AuthContextModule } from '../../common/auth/auth-context.module';
import { DatabaseModule } from '../../database/database.module';
import { FcmPushService } from './fcm-push.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { SmsService } from './sms.service';

@Module({
  imports: [AuthContextModule, DatabaseModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, SmsService, FcmPushService],
  exports: [NotificationsService, SmsService, FcmPushService],
})
export class NotificationsModule {}
