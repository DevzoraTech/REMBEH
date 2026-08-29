import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { COLLECTION_PERMISSIONS } from './collections.permissions';
import { CollectionsService } from './collections.service';
import { RecordRepaymentDto } from './dto/record-repayment.dto';
import {
  LegacyLoanCorrectionDto,
  LegacyLoanDeleteDto,
} from './dto/legacy-loan-correction.dto';
import {
  LegacyLoanMediaConfirmDto,
  LegacyLoanMediaPresignDto,
} from './dto/legacy-loan-media.dto';
import {
  BulkRepaymentSmsDto,
  SendRepaymentSmsDto,
} from './dto/repayment-sms.dto';

@Controller('collections')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Get('summary')
  @RequirePermissions(COLLECTION_PERMISSIONS.read)
  getSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.collectionsService.getSummary(user);
  }

  @Get('due-today')
  @RequirePermissions(COLLECTION_PERMISSIONS.read)
  listDueToday(@CurrentUser() user: AuthenticatedUser) {
    return this.collectionsService.listDueToday(user);
  }

  @Get('daily-summary')
  @RequirePermissions(COLLECTION_PERMISSIONS.read)
  getDailySummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query('date') date?: string,
  ) {
    return this.collectionsService.getDailySummary(user, date);
  }

  @Get('daily-summary/:agentId')
  @RequirePermissions(COLLECTION_PERMISSIONS.read)
  getDailyAgentDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Query('date') date?: string,
  ) {
    return this.collectionsService.getDailyAgentDetail(user, agentId, date);
  }

  @Get('repayments')
  @RequirePermissions(COLLECTION_PERMISSIONS.read)
  listRepayments(
    @CurrentUser() user: AuthenticatedUser,
    @Query('filter') filter?: string,
  ) {
    return this.collectionsService.listRepayments(user, filter);
  }

  @Get('repayments/:repaymentId')
  @RequirePermissions(COLLECTION_PERMISSIONS.read)
  getRepaymentDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('repaymentId', ParseUUIDPipe) repaymentId: string,
  ) {
    return this.collectionsService.getRepaymentDetail(user, repaymentId);
  }

  @Post('repayments/sms/bulk')
  @RequirePermissions(COLLECTION_PERMISSIONS.create)
  sendBulkRepaymentSms(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkRepaymentSmsDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.collectionsService.sendBulkRepaymentSms(
      user,
      dto,
      idempotencyKey,
    );
  }

  @Post('repayments/:repaymentId/sms')
  @RequirePermissions(COLLECTION_PERMISSIONS.create)
  sendRepaymentSms(
    @CurrentUser() user: AuthenticatedUser,
    @Param('repaymentId', ParseUUIDPipe) repaymentId: string,
    @Body() dto: SendRepaymentSmsDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.collectionsService.sendRepaymentSms(
      user,
      repaymentId,
      dto,
      idempotencyKey,
    );
  }

  @Get('clients/search')
  @RequirePermissions(COLLECTION_PERMISSIONS.read)
  searchClients(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') query = '',
  ) {
    return this.collectionsService.searchClients(user, query);
  }

  /** Branch active-loan index for mobile offline cache. */
  @Get('offline-snapshot')
  @RequirePermissions(COLLECTION_PERMISSIONS.read)
  offlineSnapshot(@CurrentUser() user: AuthenticatedUser) {
    return this.collectionsService.offlineSnapshot(user);
  }

  @Get('loans/:loanId')
  @RequirePermissions(COLLECTION_PERMISSIONS.read)
  getLoanDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('loanId', ParseUUIDPipe) loanId: string,
  ) {
    return this.collectionsService.getLoanDetail(user, loanId);
  }

  @Patch('loans/:loanId/legacy-correction')
  @RequirePermissions(COLLECTION_PERMISSIONS.create)
  correctLegacyLoan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('loanId', ParseUUIDPipe) loanId: string,
    @Body() dto: LegacyLoanCorrectionDto,
  ) {
    return this.collectionsService.correctLegacyLoan(user, loanId, dto);
  }

  @Post('loans/:loanId/legacy-correction/delete')
  @RequirePermissions(COLLECTION_PERMISSIONS.create)
  deleteLegacyLoan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('loanId', ParseUUIDPipe) loanId: string,
    @Body() dto: LegacyLoanDeleteDto,
  ) {
    return this.collectionsService.deleteLegacyLoan(user, loanId, dto);
  }

  @Post('loans/:loanId/legacy-correction/media/presign')
  @RequirePermissions(COLLECTION_PERMISSIONS.create)
  presignLegacyLoanCorrectionMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Param('loanId', ParseUUIDPipe) loanId: string,
    @Body() dto: LegacyLoanMediaPresignDto,
  ) {
    return this.collectionsService.presignLegacyLoanCorrectionMedia(
      user,
      loanId,
      dto,
    );
  }

  @Post('loans/:loanId/legacy-correction/media/confirm')
  @RequirePermissions(COLLECTION_PERMISSIONS.create)
  confirmLegacyLoanCorrectionMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Param('loanId', ParseUUIDPipe) loanId: string,
    @Body() dto: LegacyLoanMediaConfirmDto,
  ) {
    return this.collectionsService.confirmLegacyLoanCorrectionMedia(
      user,
      loanId,
      dto,
    );
  }

  /** Alias: wallet view is the loan detail surface for field agents. */
  @Get('wallets/:loanId')
  @RequirePermissions(COLLECTION_PERMISSIONS.read)
  getWallet(
    @CurrentUser() user: AuthenticatedUser,
    @Param('loanId', ParseUUIDPipe) loanId: string,
  ) {
    return this.collectionsService.getLoanDetail(user, loanId);
  }

  @Post('repayments')
  @RequirePermissions(COLLECTION_PERMISSIONS.create)
  recordRepayment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RecordRepaymentDto,
  ) {
    return this.collectionsService.recordRepayment(user, dto);
  }
}
