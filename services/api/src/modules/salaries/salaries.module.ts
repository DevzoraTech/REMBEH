import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { StorageModule } from '../storage/storage.module';
import { SalariesController } from './salaries.controller';
import { SalariesRepository } from './salaries.repository';
import { SalariesService } from './salaries.service';

@Module({
  imports: [DatabaseModule, StorageModule],
  controllers: [SalariesController],
  providers: [SalariesService, SalariesRepository],
  exports: [SalariesService],
})
export class SalariesModule {}
