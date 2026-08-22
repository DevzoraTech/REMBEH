import { Module } from '@nestjs/common';
import { SecurityModule } from '../../common/security/security.module';
import { DatabaseModule } from '../../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ControlCenterAuthGuard } from './control-center-auth.guard';
import { ControlCenterController } from './control-center.controller';
import { ControlCenterService } from './control-center.service';

@Module({
  imports: [DatabaseModule, SecurityModule, NotificationsModule],
  controllers: [ControlCenterController],
  providers: [ControlCenterService, ControlCenterAuthGuard],
  exports: [ControlCenterService],
})
export class ControlCenterModule {}
