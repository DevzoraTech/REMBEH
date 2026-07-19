import { Module } from '@nestjs/common';
import { AuthContextModule } from '../../common/auth/auth-context.module';
import { SecurityModule } from '../../common/security/security.module';
import { DatabaseModule } from '../../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  BranchesController,
  BranchStaffInvitationsController,
} from './branches.controller';
import { BranchesRepository } from './branches.repository';
import { BranchesService } from './branches.service';

@Module({
  imports: [
    AuthContextModule,
    DatabaseModule,
    NotificationsModule,
    SecurityModule,
  ],
  controllers: [BranchesController, BranchStaffInvitationsController],
  providers: [BranchesRepository, BranchesService],
})
export class BranchesModule {}
