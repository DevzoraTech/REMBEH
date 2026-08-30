import { Module } from '@nestjs/common';
import { AuthContextModule } from '../../common/auth/auth-context.module';
import { DatabaseModule } from '../../database/database.module';
import { LoanApplicationsModule } from '../loan-applications/loan-applications.module';
import { LoanProductsModule } from '../loan-products/loan-products.module';
import { SmsCreditsModule } from '../sms-credits/sms-credits.module';
import { LoanRemindersService } from './loan-reminders.service';
import { LoansController } from './loans.controller';
import { LoansRepository } from './loans.repository';
import { LoansService } from './loans.service';

@Module({
  imports: [
    AuthContextModule,
    DatabaseModule,
    LoanApplicationsModule,
    LoanProductsModule,
    SmsCreditsModule,
  ],
  controllers: [LoansController],
  providers: [LoansService, LoansRepository, LoanRemindersService],
})
export class LoansModule {}
