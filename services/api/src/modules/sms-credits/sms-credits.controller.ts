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

  /** Active catalogue — server prices only. */
  @Get('bundles')
  listBundles() {
    return this.smsCreditsService.listBundles();
  }

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

  @Get('ledger')
  listLedger(
    @CurrentUser() user: AuthenticatedUser,
    @Query('branchId') branchId?: string,
  ) {
    return this.smsCreditsService.listLedger(user, branchId);
  }

  /** Body: { bundleId, branchId? } — never price/units from client. */
  @Post('purchases')
  startPurchase(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { bundleId?: string; branchId?: string },
  ) {
    return this.smsCreditsService.startPurchase(user, {
      bundleId: body?.bundleId ?? '',
      branchId: body?.branchId,
    });
  }

  /**
   * Workflow C — retry a failed message as a new attempt.
   * Body may optionally override destination/body after edits.
   */
  @Post('messages/:messageId/retry')
  retryMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() body?: { destination?: string; body?: string },
  ) {
    return this.smsCreditsService.retryBranchSms(user, messageId, body);
  }
}
