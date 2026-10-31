import { Module } from '@nestjs/common';
import { AuthContextModule } from '../../common/auth/auth-context.module';
import { DatabaseModule } from '../../database/database.module';
import { BorrowerOnboardingSetupController } from './setup.controller';
import { BorrowerOnboardingSetupService } from './setup.service';
import { OpeningRecordService } from './opening-record.service';
import { OpeningRecordController } from './opening-record.controller';
import { OnboardingMediaService } from './onboarding-media.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [AuthContextModule, DatabaseModule, StorageModule],
  controllers: [BorrowerOnboardingSetupController, OpeningRecordController],
  providers: [BorrowerOnboardingSetupService, OpeningRecordService, OnboardingMediaService],
})
export class BorrowerOnboardingModule {}
