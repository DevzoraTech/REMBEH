import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { BillingService } from './billing.service';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  /** Owner: all branches. Manager: own branch only. */
  @Get('summary')
  @UseGuards(JwtAuthGuard)
  getSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getSummary(user);
  }

  /** Locked / grace status for the caller's assigned branch. */
  @Get('my-branch')
  @UseGuards(JwtAuthGuard)
  getMyBranchStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getMyBranchStatus(user);
  }

  /** Payment / subscription history for the caller's scope. */
  @Get('payments')
  @UseGuards(JwtAuthGuard)
  listPayments(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.listPayments(user);
  }

  /** Owner may pay any branch; manager may pay their own branch. */
  @Post('branches/:branchId/checkout')
  @UseGuards(JwtAuthGuard)
  startCheckout(
    @CurrentUser() user: AuthenticatedUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
  ) {
    return this.billingService.startCheckout(user, branchId);
  }

  @Get('pesapal/ipn')
  async pesapalIpn(
    @Query('OrderTrackingId') OrderTrackingId?: string,
    @Query('OrderMerchantReference') OrderMerchantReference?: string,
    @Query('OrderNotificationType') OrderNotificationType?: string,
  ) {
    return this.billingService.handlePesapalNotification({
      OrderTrackingId,
      OrderMerchantReference,
      OrderNotificationType,
    });
  }

  @Get('pesapal/callback')
  async pesapalCallback(
    @Res() res: Response,
    @Query('OrderTrackingId') OrderTrackingId?: string,
    @Query('OrderMerchantReference') OrderMerchantReference?: string,
  ) {
    const redirectTo = await this.billingService.handlePesapalCallback({
      OrderTrackingId,
      OrderMerchantReference,
    });
    return res.redirect(redirectTo);
  }
}
