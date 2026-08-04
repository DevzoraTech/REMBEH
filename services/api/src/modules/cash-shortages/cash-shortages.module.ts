import { Module } from '@nestjs/common';
import { AuthContextModule } from '../../common/auth/auth-context.module';
import { DatabaseModule } from '../../database/database.module';
import { CashShortagesController } from './cash-shortages.controller';
import { CashShortagesService } from './cash-shortages.service';

@Module({
  imports: [AuthContextModule, DatabaseModule],
  controllers: [CashShortagesController],
  providers: [CashShortagesService],
  exports: [CashShortagesService],
})
export class CashShortagesModule {}
