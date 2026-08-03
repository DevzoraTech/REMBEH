import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { SmsCreditsService } from './sms-credits.service';

@Controller('sms-credits')
@UseGuards(JwtAuthGuard)
export class SmsCreditsController {
  constructor(private readonly smsCreditsService: SmsCreditsService) {}

  /** Manager: own branch. Owner: sum across branches. */
  @Get('balance')
  getBalance(@CurrentUser() user: AuthenticatedUser) {
    return this.smsCreditsService.getBalance(user);
  }

  /** Manager: own branch. Owner: optional ?branchId= */
  @Get('wallet')
  getWallet(
    @CurrentUser() user: AuthenticatedUser,
    @Query('branchId') branchId?: string,
  ) {
    return this.smsCreditsService.getWallet(user, branchId);
  }

  @Post('branches/:branchId/top-up')
  startTopUp(
    @CurrentUser() user: AuthenticatedUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() body: { amountUgx?: number },
  ) {
    return this.smsCreditsService.startTopUp(
      user,
      branchId,
      Number(body?.amountUgx),
    );
  }
}
