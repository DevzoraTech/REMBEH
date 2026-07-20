import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { BranchesModule } from './modules/branches/branches.module';
import { CollectionsModule } from './modules/collections/collections.module';
import { CustomersModule } from './modules/customers/customers.module';
import { IdentityVerificationModule } from './modules/identity-verification/identity-verification.module';
import { LoanApplicationsModule } from './modules/loan-applications/loan-applications.module';
import { LoanProductsModule } from './modules/loan-products/loan-products.module';
import { PlatformModule } from './modules/platform/platform.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { StorageModule } from './modules/storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env', '../../.env'],
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    StorageModule,
    RealtimeModule,
    AuthModule,
    BranchesModule,
    CustomersModule,
    CollectionsModule,
    IdentityVerificationModule,
    LoanApplicationsModule,
    LoanProductsModule,
    PlatformModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

