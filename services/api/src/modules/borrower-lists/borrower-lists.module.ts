import { Module } from '@nestjs/common';
import { AuthContextModule } from '../../common/auth/auth-context.module';
import { DatabaseModule } from '../../database/database.module';
import { BorrowerListsController } from './borrower-lists.controller';
import { BorrowerListsRepository } from './borrower-lists.repository';
import { BorrowerListsService } from './borrower-lists.service';

@Module({
  imports: [AuthContextModule, DatabaseModule],
  controllers: [BorrowerListsController],
  providers: [BorrowerListsService, BorrowerListsRepository],
  exports: [BorrowerListsService],
})
export class BorrowerListsModule {}
