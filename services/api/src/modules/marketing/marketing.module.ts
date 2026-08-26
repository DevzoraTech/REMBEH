import { Module } from '@nestjs/common';
import { AuthContextModule } from '../../common/auth/auth-context.module';
import { DatabaseModule } from '../../database/database.module';
import { StorageModule } from '../storage/storage.module';
import { MarketingController } from './marketing.controller';
import { MarketingService } from './marketing.service';

@Module({
  imports: [AuthContextModule, DatabaseModule, StorageModule],
  controllers: [MarketingController],
  providers: [MarketingService],
  exports: [MarketingService],
})
export class MarketingModule {}
