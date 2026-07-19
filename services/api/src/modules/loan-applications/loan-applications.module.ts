import { Module } from '@nestjs/common';
import { AuthContextModule } from '../../common/auth/auth-context.module';
import { DatabaseModule } from '../../database/database.module';
import { IdentityVerificationModule } from '../identity-verification/identity-verification.module';
import { LoanApplicationsController } from './loan-applications.controller';
import { LoanApplicationsRepository } from './loan-applications.repository';
import { LoanApplicationsService } from './loan-applications.service';

@Module({
  imports: [AuthContextModule, DatabaseModule, IdentityVerificationModule],
  controllers: [LoanApplicationsController],
  providers: [LoanApplicationsService, LoanApplicationsRepository],
  exports: [LoanApplicationsService],
})
export class LoanApplicationsModule {}
