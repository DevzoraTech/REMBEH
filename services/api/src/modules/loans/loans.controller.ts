import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { CreateLoanApplicationFromCustomerDto } from '../loan-applications/dto/create-from-customer.dto';
import { LOAN_PERMISSIONS } from './loans.permissions';
import { LoansService } from './loans.service';

@Controller('loans')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Get()
  @RequirePermissions(LOAN_PERMISSIONS.read)
  listLoans(@CurrentUser() user: AuthenticatedUser) {
    return this.loansService.listLoans(user);
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
