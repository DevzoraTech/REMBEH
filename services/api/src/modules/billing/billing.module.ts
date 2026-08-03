import { Module } from '@nestjs/common';
import { AuthContextModule } from '../../common/auth/auth-context.module';
import { DatabaseModule } from '../../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { PesapalClient } from './pesapal.client';

@Module({
  imports: [AuthContextModule, DatabaseModule, NotificationsModule],
  controllers: [BillingController],
  providers: [BillingService, PesapalClient],
  exports: [BillingService],
})
export class BillingModule {}
