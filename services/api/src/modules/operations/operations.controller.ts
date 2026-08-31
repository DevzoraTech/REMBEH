import {
  Body,
  Controller,
  Get,
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

import { OpenBranchOperationDto } from './dto/open-branch-operation.dto';
import {
  RecordAgentReturnDto,
  RecordOwnAgentReturnDto,
} from './dto/record-agent-return.dto';
import { RecordOperationExpenseDto } from './dto/record-operation-expense.dto';
import { RecordOperationTopUpDto } from './dto/record-operation-top-up.dto';
import { ReviewOperationReportDto } from './dto/review-operation-report.dto';
import { UpdateOperationExpenseDto } from './dto/update-operation-expense.dto';
import { VoidOperationExpenseDto } from './dto/void-operation-expense.dto';
import { UpdateOperationReconciliationNotesDto } from './dto/update-operation-reconciliation-notes.dto';

import { StartOperationReconciliationDto } from './dto/start-operation-reconciliation.dto';
import { UpdateOperationCashCountDto } from './dto/update-operation-reconciliation';
import { SubmitOperationReconciliationDto } from './dto/submit-operation-reconciliation';

import { OperationsService } from './operations.service';
import { OPERATIONS_PERMISSIONS } from './operations.permissions';
@Controller('operations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  // ---------------------------------------------------------------------------
  // Agent day
  // ---------------------------------------------------------------------------

  @Get('agent-today')
  getAgentToday(@CurrentUser() user: AuthenticatedUser) {
    return this.operationsService.getAgentToday(user);
  }

  // ---------------------------------------------------------------------------
  // Branch daily operation
  // ---------------------------------------------------------------------------

  @Get('today')
  @RequirePermissions(OPERATIONS_PERMISSIONS.read)
  getToday(
    @CurrentUser() user: AuthenticatedUser,
    @Query('branchId') branchId?: string,
    @Query('date') date?: string,
  ) {
    return this.operationsService.getToday(user, {
      branchId,
      date,
    });
  }

  /**
   * Legacy/manual opening endpoint.
   *
   * Normal operating days are auto-opened by OperationsService,
   * but this remains available for first-day/manual recovery flows.
   */
  @Post('open')
  @RequirePermissions(OPERATIONS_PERMISSIONS.open)
  openBranch(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: OpenBranchOperationDto,
  ) {
    return this.operationsService.openBranch(user, dto);
  }

  // ---------------------------------------------------------------------------
  // Expenses
  // ---------------------------------------------------------------------------

  @Post('expenses')
  @RequirePermissions(OPERATIONS_PERMISSIONS.expenseCreate)
  recordExpense(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RecordOperationExpenseDto,
  ) {
    return this.operationsService.recordExpense(user, dto);
  }

  @Patch('expenses/:expenseId')
  @RequirePermissions(OPERATIONS_PERMISSIONS.expenseCreate)
  updateExpense(
    @CurrentUser() user: AuthenticatedUser,
    @Param('expenseId') expenseId: string,
    @Body() dto: UpdateOperationExpenseDto,
  ) {
    return this.operationsService.updateExpense(user, expenseId, dto);
  }

  @Post('expenses/:expenseId/void')
  @RequirePermissions(OPERATIONS_PERMISSIONS.expenseCreate)
  voidExpense(
    @CurrentUser() user: AuthenticatedUser,
    @Param('expenseId') expenseId: string,
    @Body() dto: VoidOperationExpenseDto,
  ) {
    return this.operationsService.voidExpense(user, expenseId, dto);
  }

  // ---------------------------------------------------------------------------
  // Branch cash top-ups
  // ---------------------------------------------------------------------------

  @Post('top-ups')
  @RequirePermissions(OPERATIONS_PERMISSIONS.cashTopUp)
  recordTopUp(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RecordOperationTopUpDto,
  ) {
    return this.operationsService.recordTopUp(user, dto);
  }

  // ---------------------------------------------------------------------------
  // Agent balancing / cash handover
  // ---------------------------------------------------------------------------

  @Post('agent-return')
  recordOwnAgentReturn(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RecordOwnAgentReturnDto,
  ) {
    return this.operationsService.recordOwnAgentReturn(user, dto);
  }

  @Post('agent-returns')
  @RequirePermissions(OPERATIONS_PERMISSIONS.floatReturn)
  recordAgentReturn(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RecordAgentReturnDto,
  ) {
    return this.operationsService.recordAgentReturn(user, dto);
  }

  // ---------------------------------------------------------------------------
  // End-of-day reconciliation
  // ---------------------------------------------------------------------------

  /**
   * Starts/resumes reconciliation for the branch day.
   *
   * This does NOT close the branch.
   * It creates the persisted reconciliation draft.
   */
  @Post('reconciliation/start')
  @RequirePermissions(OPERATIONS_PERMISSIONS.close)
  startReconciliation(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    dto: StartOperationReconciliationDto,
  ) {
    return this.operationsService.startReconciliation(user, dto);
  }

  /**
   * Records a physical cash count.
   *
   * Every submission creates an immutable
   * BranchOperationCashCount history row.
   */
  @Post('reconciliation/cash-count')
  @RequirePermissions(OPERATIONS_PERMISSIONS.close)
  updateReconciliationCashCount(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    dto: UpdateOperationCashCountDto,
  ) {
    return this.operationsService.updateReconciliationCashCount(user, dto);
  }

  @Post('reconciliation/notes')
@RequirePermissions(OPERATIONS_PERMISSIONS.close)
updateReconciliationNotes(
  @CurrentUser() user: AuthenticatedUser,
  @Body() dto: UpdateOperationReconciliationNotesDto,
) {
  return this.operationsService.updateReconciliationNotes(
    user,
    dto,
  );
}

  /**
   * Final reconciliation submission.
   *
   * The latest persisted countedCash becomes the authoritative
   * branch closing balance.
   *
   * This is the path that should ultimately move:
   *
   * OPEN -> CLOSING -> CLOSED
   */
  @Post('reconciliation/submit')
  @RequirePermissions(OPERATIONS_PERMISSIONS.close)
  submitReconciliation(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    dto: SubmitOperationReconciliationDto,
  ) {
    return this.operationsService.submitReconciliation(user, dto);
  }

  // ---------------------------------------------------------------------------
  // Reports
  // ---------------------------------------------------------------------------

  @Get('reports')
  @RequirePermissions(OPERATIONS_PERMISSIONS.read)
  listOwnerReports(
    @CurrentUser() user: AuthenticatedUser,
    @Query('branchId') branchId?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.operationsService.listOwnerReports(user, {
      branchId,
      status,
      from,
      to,
    });
  }

  @Get('owner-daily-status')
  @RequirePermissions(OPERATIONS_PERMISSIONS.approve)
  listOwnerBranchDailyStatuses(
    @CurrentUser() user: AuthenticatedUser,
    @Query('date') date?: string,
  ) {
    return this.operationsService.listOwnerBranchDailyStatuses(user, date);
  }

  @Get('reports/:reportId')
  @RequirePermissions(OPERATIONS_PERMISSIONS.read)
  getOwnerReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportId', ParseUUIDPipe)
    reportId: string,
  ) {
    return this.operationsService.getOwnerReport(user, reportId);
  }

  @Post('reports/:reportId/manager-confirm')
  @RequirePermissions(OPERATIONS_PERMISSIONS.reportReview)
  managerConfirmReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportId', ParseUUIDPipe)
    reportId: string,
    @Body() dto: ReviewOperationReportDto,
  ) {
    return this.operationsService.managerConfirmReport(user, reportId, dto);
  }

  @Post('reports/:reportId/owner-approve')
  @RequirePermissions(OPERATIONS_PERMISSIONS.approve)
  ownerApproveReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportId', ParseUUIDPipe)
    reportId: string,
    @Body() dto: ReviewOperationReportDto,
  ) {
    return this.operationsService.ownerApproveReport(user, reportId, dto);
  }
}
