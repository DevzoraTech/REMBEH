import { Module } from '@nestjs/common';
import { AuthContextModule } from '../../common/auth/auth-context.module';
import { SecurityModule } from '../../common/security/security.module';
import { DatabaseModule } from '../../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    AuthContextModule,
    DatabaseModule,
    NotificationsModule,
    SecurityModule,
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
