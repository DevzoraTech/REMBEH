import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { AuthContextModule } from '../../common/auth/auth-context.module';
import { DatabaseModule } from '../../database/database.module';
import { AppUpdateController } from './app-update.controller';
import { AppUpdateService } from './app-update.service';
import { ReleaseStorageService } from './release-storage.service';

@Module({
  imports: [
    AuthContextModule,
    DatabaseModule,
    MulterModule.register({ storage: undefined }),
  ],
  controllers: [AppUpdateController],
  providers: [AppUpdateService, ReleaseStorageService],
  exports: [AppUpdateService, ReleaseStorageService],
})
export class AppUpdateModule {}
