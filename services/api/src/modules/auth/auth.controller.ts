import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterWorkspaceDto } from './dto/register-workspace.dto';
import { ResendWorkspaceEmailOtpDto } from './dto/resend-workspace-email-otp.dto';
import { VerifyWorkspaceEmailDto } from './dto/verify-workspace-email.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('workspace/register')
  registerWorkspace(@Body() dto: RegisterWorkspaceDto) {
    return this.authService.registerWorkspace(dto);
  }

  @Post('workspace/verify-email')
  verifyWorkspaceEmail(@Body() dto: VerifyWorkspaceEmailDto) {
    return this.authService.verifyWorkspaceEmail(dto);
  }

  @Post('workspace/resend-email-otp')
  resendWorkspaceEmailOtp(@Body() dto: ResendWorkspaceEmailOtpDto) {
    return this.authService.resendWorkspaceEmailOtp(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
