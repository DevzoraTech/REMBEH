import { Module } from '@nestjs/common';
import { AuthContextModule } from '../../common/auth/auth-context.module';
import { DatabaseModule } from '../../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LoanFinesService } from './loan-fines.service';
import { LoanProductsController } from './loan-products.controller';
import { LoanProductsRepository } from './loan-products.repository';
import { LoanProductsService } from './loan-products.service';

@Module({
  imports: [AuthContextModule, DatabaseModule, NotificationsModule],
  controllers: [LoanProductsController],
  providers: [LoanProductsService, LoanProductsRepository, LoanFinesService],
  exports: [LoanProductsService, LoanFinesService],
})
export class LoanProductsModule {}
