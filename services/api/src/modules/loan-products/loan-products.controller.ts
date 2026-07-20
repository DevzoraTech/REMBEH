import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import {
  CreateLoanPeriodOptionDto,
  CreateLoanRateOptionDto,
  UpdateLoanPeriodOptionDto,
  UpdateLoanRateOptionDto,
  UpsertLoanFinePolicyDto,
  UpsertPaymentStartPolicyDto,
} from './dto/loan-product.dto';
import { LOAN_PRODUCT_PERMISSIONS } from './loan-products.permissions';
import { LoanProductsService } from './loan-products.service';
import { LoanFinesService } from './loan-fines.service';

@Controller('loan-products')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LoanProductsController {
  constructor(
    private readonly loanProductsService: LoanProductsService,
    private readonly loanFinesService: LoanFinesService,
  ) {}

  /** Active catalog for agents; full catalog (incl. inactive) for managers. */
  @Get()
  @RequirePermissions(LOAN_PRODUCT_PERMISSIONS.read)
  getCatalog(@CurrentUser() user: AuthenticatedUser) {
    return this.loanProductsService.getCatalog(user);
  }

  @Post('rates')
  @RequirePermissions(LOAN_PRODUCT_PERMISSIONS.manage)
  createRate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateLoanRateOptionDto,
  ) {
    return this.loanProductsService.createRate(user, dto);
  }

  @Patch('rates/:id')
  @RequirePermissions(LOAN_PRODUCT_PERMISSIONS.manage)
  updateRate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLoanRateOptionDto,
  ) {
    return this.loanProductsService.updateRate(user, id, dto);
  }

  @Delete('rates/:id')
  @RequirePermissions(LOAN_PRODUCT_PERMISSIONS.manage)
  deactivateRate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.loanProductsService.deactivateRate(user, id);
  }

  @Post('periods')
  @RequirePermissions(LOAN_PRODUCT_PERMISSIONS.manage)
  createPeriod(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateLoanPeriodOptionDto,
  ) {
    return this.loanProductsService.createPeriod(user, dto);
  }

  @Patch('periods/:id')
  @RequirePermissions(LOAN_PRODUCT_PERMISSIONS.manage)
  updatePeriod(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLoanPeriodOptionDto,
  ) {
    return this.loanProductsService.updatePeriod(user, id, dto);
  }

  @Delete('periods/:id')
  @RequirePermissions(LOAN_PRODUCT_PERMISSIONS.manage)
  deactivatePeriod(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.loanProductsService.deactivatePeriod(user, id);
  }

  @Post('payment-start-policy')
  @RequirePermissions(LOAN_PRODUCT_PERMISSIONS.manage)
  upsertPaymentStartPolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertPaymentStartPolicyDto,
  ) {
    return this.loanProductsService.upsertPaymentStartPolicy(user, dto);
  }

  @Post('fine-policy')
  @RequirePermissions(LOAN_PRODUCT_PERMISSIONS.manage)
  upsertFinePolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertLoanFinePolicyDto,
  ) {
    return this.loanProductsService.upsertFinePolicy(user, dto);
  }

  /** Ops / manager: scan overdue loans and apply due fines now. */
  @Post('fines/run')
  @RequirePermissions(LOAN_PRODUCT_PERMISSIONS.manage)
  runFines(@CurrentUser() user: AuthenticatedUser) {
    return this.loanFinesService.runForTenant(user.tenantId);
  }
}
