import { Module } from '@nestjs/common';
import { AuthContextModule } from '../../common/auth/auth-context.module';
import { DatabaseModule } from '../../database/database.module';
import { LoanApplicationsModule } from '../loan-applications/loan-applications.module';
import { LoansController } from './loans.controller';
import { LoansRepository } from './loans.repository';
import { LoansService } from './loans.service';

@Module({
  imports: [AuthContextModule, DatabaseModule, LoanApplicationsModule],
  controllers: [LoansController],
  providers: [LoansService, LoansRepository],
})
export class LoansModule {}
