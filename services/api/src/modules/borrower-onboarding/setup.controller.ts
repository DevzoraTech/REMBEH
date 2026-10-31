import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { BorrowerOnboardingSetupService } from './setup.service';

@Controller('borrower-onboarding/setup')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('branch.staff.invite')
export class BorrowerOnboardingSetupController {
  constructor(private readonly setup: BorrowerOnboardingSetupService) {}
  @Get() get(@CurrentUser() user: AuthenticatedUser) {
    return this.setup.get(user);
  }
  @Put() save(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.setup.save(user, body);
  }
}
