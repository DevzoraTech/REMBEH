import { Module } from '@nestjs/common';
import { AuthContextModule } from '../../common/auth/auth-context.module';
import { DatabaseModule } from '../../database/database.module';
import { AgentsController } from './agents.controller';
import { AgentsRepository } from './agents.repository';
import { AgentsService } from './agents.service';

@Module({
  imports: [AuthContextModule, DatabaseModule],
  controllers: [AgentsController],
  providers: [AgentsService, AgentsRepository],
  exports: [AgentsService],
})
export class AgentsModule {}
