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
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { BillingService } from './billing.service';
import { BILLING_PERMISSIONS } from './billing.permissions';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('summary')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(BILLING_PERMISSIONS.manage)
  getSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getSummary(user);
  }

  /** Locked / grace status for the caller's assigned branch (managers). */
  @Get('my-branch')
  @UseGuards(JwtAuthGuard)
  getMyBranchStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getMyBranchStatus(user);
  }

  @Post('branches/:branchId/checkout')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(BILLING_PERMISSIONS.manage)
  startCheckout(
    @CurrentUser() user: AuthenticatedUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
  ) {
    return this.billingService.startCheckout(user, branchId);
  }

  /** Pesapal IPN (GET). Must respond with confirmation JSON. */
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

  /** Pesapal browser callback — redirect owner back to Subscription. */
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
