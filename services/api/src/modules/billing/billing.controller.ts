import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  type RawBodyRequest,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { BillingService } from './billing.service';
import { StartCheckoutDto } from './dto/start-checkout.dto';
import { SubmitManualMerchantPaymentDto } from './dto/submit-manual-merchant-payment.dto';

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
    @Body() body: StartCheckoutDto,
  ) {
    return this.billingService.startCheckout(user, branchId, body?.planCode);
  }

  /** Owner may submit any branch payment; manager may submit their own branch. */
  @Post('branches/:branchId/manual-payment')
  @UseGuards(JwtAuthGuard)
  submitManualMerchantPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() body: SubmitManualMerchantPaymentDto,
  ) {
    return this.billingService.submitManualMerchantPayment(
      user,
      branchId,
      body,
    );
  }

  /** Owner may submit any branch SMS payment; manager may submit their own branch. */
  @Post('branches/:branchId/manual-sms-payment')
  @UseGuards(JwtAuthGuard)
  submitManualSmsMerchantPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() body: SubmitManualMerchantPaymentDto,
  ) {
    return this.billingService.submitManualSmsMerchantPayment(
      user,
      branchId,
      body,
    );
  }

  /** Explicitly cancel a pending merchant payment request before retrying. */
  @Post('payments/:paymentId/cancel')
  @UseGuards(JwtAuthGuard)
  cancelManualMerchantPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    return this.billingService.cancelManualMerchantPayment(user, paymentId);
  }

  @Post('webhooks/resend')
  handleResendWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Body() body: unknown,
    @Headers('svix-id') svixId?: string | string[],
    @Headers('svix-timestamp') svixTimestamp?: string | string[],
    @Headers('svix-signature') svixSignature?: string | string[],
  ) {
    const payload =
      request.rawBody?.toString('utf8') ?? JSON.stringify(body ?? {});
    return this.billingService.handleResendPaymentWebhook(payload, {
      id: svixId,
      timestamp: svixTimestamp,
      signature: svixSignature,
    });
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
