import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { InitializeFlutterwavePaymentDto } from './dto/initialize-flutterwave-payment.dto';
import { VerifyFlutterwavePaymentDto } from './dto/verify-flutterwave-payment.dto';
import { FlutterwaveService } from './flutterwave.service';
import { PAYMENT_PERMISSIONS } from './payments.permissions';

@Controller('payments/flutterwave')
export class FlutterwaveController {
  constructor(private readonly flutterwaveService: FlutterwaveService) {}

  /** Public config only (public key). Secret key never leaves the server. */
  @Get('config')
  @UseGuards(JwtAuthGuard)
  getConfig() {
    return this.flutterwaveService.getPublicConfig();
  }

  @Post('initialize')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PAYMENT_PERMISSIONS.create)
  initialize(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: InitializeFlutterwavePaymentDto,
  ) {
    return this.flutterwaveService.initializePayment(user, body);
  }

  @Post('verify')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PAYMENT_PERMISSIONS.read)
  verify(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: VerifyFlutterwavePaymentDto,
  ) {
    if (body.transactionId?.trim()) {
      return this.flutterwaveService.verifyByTransactionId(
        user,
        body.transactionId.trim(),
      );
    }
    if (body.txRef?.trim()) {
      return this.flutterwaveService.verifyByTxRef(user, body.txRef.trim());
    }
    throw new BadRequestException('Provide transactionId or txRef.');
  }

  /**
   * Flutterwave webhook — no JWT. Auth is verif-hash only.
   * Always re-verifies with Flutterwave before marking success.
   */
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Headers('verif-hash') verifHash: string | undefined,
    @Body() body: unknown,
  ) {
    return this.flutterwaveService.handleWebhook(verifHash, body);
  }
}
