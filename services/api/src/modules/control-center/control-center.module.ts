import { Module } from '@nestjs/common';
import { SecurityModule } from '../../common/security/security.module';
import { DatabaseModule } from '../../database/database.module';
import { BillingModule } from '../billing/billing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ControlCenterAuthGuard } from './control-center-auth.guard';
import { ControlCenterController } from './control-center.controller';
import { ControlCenterService } from './control-center.service';

@Module({
  imports: [DatabaseModule, SecurityModule, NotificationsModule, BillingModule],
  controllers: [ControlCenterController],
  providers: [ControlCenterService, ControlCenterAuthGuard],
  exports: [ControlCenterService],
})
export class ControlCenterModule {}
