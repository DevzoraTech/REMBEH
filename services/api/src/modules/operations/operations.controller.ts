import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { OpenBranchOperationDto } from './dto/open-branch-operation.dto';
import { RecordOperationExpenseDto } from './dto/record-operation-expense.dto';
import { OperationsService } from './operations.service';
import { OPERATIONS_PERMISSIONS } from './operations.permissions';

@Controller('operations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

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
}
