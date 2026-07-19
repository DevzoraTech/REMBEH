import { Module } from '@nestjs/common';
import { AuthContextModule } from '../../common/auth/auth-context.module';
import { DatabaseModule } from '../../database/database.module';
import { LoanProductsController } from './loan-products.controller';
import { LoanProductsRepository } from './loan-products.repository';
import { LoanProductsService } from './loan-products.service';

@Module({
  imports: [AuthContextModule, DatabaseModule],
  controllers: [LoanProductsController],
  providers: [LoanProductsService, LoanProductsRepository],
  exports: [LoanProductsService],
})
export class LoanProductsModule {}
