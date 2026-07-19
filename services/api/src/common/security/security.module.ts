import { Module } from '@nestjs/common';
import { OtpService } from './otp.service';
import { PasswordService } from './password.service';

@Module({
  providers: [OtpService, PasswordService],
  exports: [OtpService, PasswordService],
})
export class SecurityModule {}
