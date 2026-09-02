import { Module } from '@nestjs/common';
import { SecurityModule } from '../../common/security/security.module';
import { DatabaseModule } from '../../database/database.module';
import { BillingModule } from '../billing/billing.module';
import { MarketingModule } from '../marketing/marketing.module';
import { AppUpdateModule } from '../app-update/app-update.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ControlCenterAuthGuard } from './control-center-auth.guard';
import { ControlCenterController } from './control-center.controller';
import { ControlCenterService } from './control-center.service';

@Module({
  imports: [
    DatabaseModule,
    SecurityModule,
    NotificationsModule,
    BillingModule,
    MarketingModule,
    AppUpdateModule,
  ],
  controllers: [ControlCenterController],
  providers: [ControlCenterService, ControlCenterAuthGuard],
  exports: [ControlCenterService],
})
export class ControlCenterModule {}
