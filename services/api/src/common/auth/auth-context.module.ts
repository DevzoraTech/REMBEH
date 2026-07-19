import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtTokenService } from './jwt-token.service';
import { PermissionsGuard } from './permissions.guard';

@Module({
  imports: [DatabaseModule],
  providers: [JwtAuthGuard, JwtTokenService, PermissionsGuard],
  exports: [JwtAuthGuard, JwtTokenService, PermissionsGuard],
})
export class AuthContextModule {}
