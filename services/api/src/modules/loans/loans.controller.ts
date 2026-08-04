import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { CreateLoanApplicationFromCustomerDto } from '../loan-applications/dto/create-from-customer.dto';
import {
  BulkLoanRemindersDto,
  SendLoanReminderDto,
} from './dto/loan-reminders.dto';
import { LoanRemindersService } from './loan-reminders.service';
import { LOAN_PERMISSIONS } from './loans.permissions';
import { LoansService } from './loans.service';

@Controller('loans')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LoansController {
  constructor(
    private readonly loansService: LoansService,
    private readonly loanRemindersService: LoanRemindersService,
  ) {}

  @Get()
  @RequirePermissions(LOAN_PERMISSIONS.read)
  listLoans(@CurrentUser() user: AuthenticatedUser) {
    return this.loansService.listLoans(user);
  }

  @Post('reminders/bulk')
  @RequirePermissions(LOAN_PERMISSIONS.update)
  enqueueBulkReminders(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkLoanRemindersDto,
  ) {
    return this.loanRemindersService.enqueueBulk(user, dto.filter);
  }

  @Get('reminders/batches/:batchId')
  @RequirePermissions(LOAN_PERMISSIONS.read)
  getReminderBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('batchId', ParseUUIDPipe) batchId: string,
  ) {
    return this.loanRemindersService.getBatch(user, batchId);
  }

  @Post(':loanId/reminders')
  @RequirePermissions(LOAN_PERMISSIONS.update)
  enqueueLoanReminder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('loanId', ParseUUIDPipe) loanId: string,
    @Body() dto: SendLoanReminderDto,
  ) {
    return this.loanRemindersService.enqueueSingle(user, loanId, {
      resend: dto.resend,
    });
  }

  @Post('applications')
  @RequirePermissions(LOAN_PERMISSIONS.create)
  createApplication(@CurrentUser() user: AuthenticatedUser) {
    return this.loansService.createApplication(user);
  }

  @Post('applications/from-borrower')
  @RequirePermissions(LOAN_PERMISSIONS.create)
  createApplicationFromBorrower(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateLoanApplicationFromCustomerDto,
  ) {
    return this.loansService.createApplicationFromBorrower(user, dto);
  }
}
