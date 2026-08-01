import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { SendPushTestDto } from './dto/send-push-test.dto';
import { FcmPushService } from './fcm-push.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly fcmPushService: FcmPushService) {}

  @Get('push/config')
  getPushConfig() {
    return {
      webEnabled: this.fcmPushService.isEnabled('WEB'),
      mobileEnabled: this.fcmPushService.isEnabled('MOBILE'),
      vapidKey: process.env.FIREBASE_WEB_VAPID_KEY ?? null,
    };
  }

  @Post('push/tokens')
  async registerToken(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterPushTokenDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    const row = await this.fcmPushService.registerToken({
      tenantId: user.tenantId,
      userId: user.userId,
      token: dto.token.trim(),
      platform: dto.platform,
      projectKey: dto.projectKey,
      deviceId: dto.deviceId,
      userAgent: userAgent ?? null,
    });

    return {
      id: row.id,
      platform: row.platform,
      projectKey: row.projectKey,
      enabled: row.enabled,
    };
  }

  @Delete('push/tokens')
  async unregisterToken(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { token?: string },
  ) {
    if (!body.token) {
      return { ok: true };
    }
    await this.fcmPushService.unregisterToken({
      userId: user.userId,
      token: body.token,
    });
    return { ok: true };
  }

  /** Owner/dev self-test: send a push to the current user (or optional userId). */
  @Post('push/test')
  async sendTest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendPushTestDto,
  ) {
    const targetUserId = dto.userId ?? user.userId;
    const result = await this.fcmPushService.sendToUser(
      user.tenantId,
      targetUserId,
      {
        title: dto.title,
        body: dto.body,
        href: dto.href,
      },
    );
    return {
      ...result,
      webEnabled: this.fcmPushService.isEnabled('WEB'),
      mobileEnabled: this.fcmPushService.isEnabled('MOBILE'),
    };
  }
}
