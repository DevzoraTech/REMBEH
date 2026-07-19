import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import {
  ProfilePhotoConfirmDto,
  ProfilePhotoPresignDto,
} from './dto/profile-photo.dto';
import { RefreshSessionDto } from './dto/refresh-session.dto';
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

  @Post('refresh')
  refresh(@Body() dto: RefreshSessionDto) {
    return this.authService.refreshSession(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getMe(user.userId, user.tenantId);
  }

  @Post('profile-photo/presign')
  @UseGuards(JwtAuthGuard)
  presignProfilePhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ProfilePhotoPresignDto,
  ) {
    return this.authService.presignProfilePhotoUpload(
      user.userId,
      user.tenantId,
      dto,
    );
  }

  @Post('profile-photo/confirm')
  @UseGuards(JwtAuthGuard)
  confirmProfilePhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ProfilePhotoConfirmDto,
  ) {
    return this.authService.confirmProfilePhoto(
      user.userId,
      user.tenantId,
      dto,
    );
  }
}
