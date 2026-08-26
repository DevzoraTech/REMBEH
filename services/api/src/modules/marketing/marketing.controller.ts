import { Controller, Get, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { MarketingService } from './marketing.service';

@Controller('marketing')
@UseGuards(JwtAuthGuard)
export class MarketingController {
  constructor(private readonly marketingService: MarketingService) {}

  @Get('mobile-header')
  mobileHeaderCampaign(@CurrentUser() user: AuthenticatedUser) {
    return this.marketingService.mobileHeaderCampaign(user);
  }
}
