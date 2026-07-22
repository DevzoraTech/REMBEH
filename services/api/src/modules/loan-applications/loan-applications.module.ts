import { Module } from '@nestjs/common';
import { AuthContextModule } from '../../common/auth/auth-context.module';
import { DatabaseModule } from '../../database/database.module';
import { BorrowerListsModule } from '../borrower-lists/borrower-lists.module';
import { IdentityVerificationModule } from '../identity-verification/identity-verification.module';
import { LoanProductsModule } from '../loan-products/loan-products.module';
import { LoanApplicationsController } from './loan-applications.controller';
import { LoanApplicationsRepository } from './loan-applications.repository';
import { LoanApplicationsService } from './loan-applications.service';

@Module({
  imports: [
    AuthContextModule,
    DatabaseModule,
    BorrowerListsModule,
    IdentityVerificationModule,
    LoanProductsModule,
  ],
  controllers: [LoanApplicationsController],
  providers: [LoanApplicationsService, LoanApplicationsRepository],
  exports: [LoanApplicationsService],
})
export class LoanApplicationsModule {}
