import { Module } from '@nestjs/common';
import { AuthContextModule } from '../../common/auth/auth-context.module';
import { DatabaseModule } from '../../database/database.module';
import { BillingModule } from '../billing/billing.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { OperationsController } from './operations.controller';
import { OperationsRepository } from './operations.repository';
import { OperationsService } from './operations.service';

@Module({
  imports: [AuthContextModule, DatabaseModule, BillingModule, RealtimeModule],
  controllers: [OperationsController],
  providers: [OperationsService, OperationsRepository],
  exports: [OperationsService],
})
export class OperationsModule {}
