import { Module } from '@nestjs/common';
import { AuthContextModule } from '../../common/auth/auth-context.module';
import { DatabaseModule } from '../../database/database.module';
import { BillingModule } from '../billing/billing.module';
import { BorrowerListsModule } from '../borrower-lists/borrower-lists.module';
import { IdentityVerificationModule } from '../identity-verification/identity-verification.module';
import { LoanProductsModule } from '../loan-products/loan-products.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SmsCreditsModule } from '../sms-credits/sms-credits.module';
import { LoanApplicationsController } from './loan-applications.controller';
import { LoanApplicationsRepository } from './loan-applications.repository';
import { LoanApplicationsService } from './loan-applications.service';

@Module({
  imports: [
    AuthContextModule,
    DatabaseModule,
    BillingModule,
    BorrowerListsModule,
    IdentityVerificationModule,
    LoanProductsModule,
    NotificationsModule,
    SmsCreditsModule,
  ],
  controllers: [LoanApplicationsController],
  providers: [LoanApplicationsService, LoanApplicationsRepository],
  exports: [LoanApplicationsService],
})
export class LoanApplicationsModule {}
