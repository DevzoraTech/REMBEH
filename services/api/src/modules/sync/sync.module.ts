import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { DatabaseModule } from '../../database/database.module';
import { AuthContextModule } from '../../common/auth/auth-context.module';

@Module({
  imports: [DatabaseModule, AuthContextModule],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
