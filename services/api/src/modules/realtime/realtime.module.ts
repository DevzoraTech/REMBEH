import { Global, Module } from '@nestjs/common';
import { AuthContextModule } from '../../common/auth/auth-context.module';
import { DatabaseModule } from '../../database/database.module';
import { RealtimeGateway } from './realtime.gateway';

@Global()
@Module({
  imports: [AuthContextModule, DatabaseModule],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
