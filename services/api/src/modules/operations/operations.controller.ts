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
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { CloseBranchOperationDto } from './dto/close-branch-operation.dto';
import { OpenBranchOperationDto } from './dto/open-branch-operation.dto';
import { RecordAgentReturnDto } from './dto/record-agent-return.dto';
import { RecordOperationExpenseDto } from './dto/record-operation-expense.dto';
import { RecordOperationTopUpDto } from './dto/record-operation-top-up.dto';
import { ReviewOperationReportDto } from './dto/review-operation-report.dto';
import { OperationsService } from './operations.service';
import { OPERATIONS_PERMISSIONS } from './operations.permissions';

@Controller('operations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  @Get('agent-today')
  getAgentToday(@CurrentUser() user: AuthenticatedUser) {
    return this.operationsService.getAgentToday(user);
  }

  @Get('today')
  @RequirePermissions(OPERATIONS_PERMISSIONS.read)
  getToday(
    @CurrentUser() user: AuthenticatedUser,
    @Query('branchId') branchId?: string,
    @Query('date') date?: string,
  ) {
    return this.operationsService.getToday(user, { branchId, date });
  }

  @Post('open')
  @RequirePermissions(OPERATIONS_PERMISSIONS.open)
  openBranch(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: OpenBranchOperationDto,
  ) {
    return this.operationsService.openBranch(user, dto);
  }

  @Post('expenses')
  @RequirePermissions(OPERATIONS_PERMISSIONS.expenseCreate)
  recordExpense(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RecordOperationExpenseDto,
  ) {
    return this.operationsService.recordExpense(user, dto);
  }

  @Post('top-ups')
  recordTopUp(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RecordOperationTopUpDto,
  ) {
    return this.operationsService.recordTopUp(user, dto);
  }

  @Post('agent-returns')
  @RequirePermissions(OPERATIONS_PERMISSIONS.floatReturn)
  recordAgentReturn(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RecordAgentReturnDto,
  ) {
    return this.operationsService.recordAgentReturn(user, dto);
  }

  @Post('close')
  @RequirePermissions(OPERATIONS_PERMISSIONS.close)
  closeBranch(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CloseBranchOperationDto,
  ) {
    return this.operationsService.closeBranch(user, dto);
  }

  @Post('reports/:reportId/manager-confirm')
  @RequirePermissions(OPERATIONS_PERMISSIONS.reportReview)
  managerConfirmReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body() dto: ReviewOperationReportDto,
  ) {
    return this.operationsService.managerConfirmReport(user, reportId, dto);
  }

  @Post('reports/:reportId/owner-approve')
  @RequirePermissions(OPERATIONS_PERMISSIONS.approve)
  ownerApproveReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body() dto: ReviewOperationReportDto,
  ) {
    return this.operationsService.ownerApproveReport(user, reportId, dto);
  }
}
