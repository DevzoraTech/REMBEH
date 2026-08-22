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
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { RecordSalaryPaymentDto } from './dto/record-salary-payment.dto';
import { ReverseSalaryPaymentDto } from './dto/reverse-salary-payment.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { SalariesService } from './salaries.service';

@Controller('salaries')
@UseGuards(JwtAuthGuard)
export class SalariesController {
  constructor(private readonly salariesService: SalariesService) {}

  @Get()
  dashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query('branchId') branchId?: string,
    @Query('cycleStart') cycleStart?: string,
    @Query('q') search?: string,
  ) {
    return this.salariesService.dashboard(user, {
      branchId,
      cycleStart,
      search,
    });
  }

  @Get('agent-candidates')
  agentCandidates(
    @CurrentUser() user: AuthenticatedUser,
    @Query('branchId') branchId?: string,
  ) {
    return this.salariesService.listAgentCandidates(user, branchId);
  }

  @Post('employees')
  createEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEmployeeDto,
  ) {
    return this.salariesService.createEmployee(user, dto);
  }

  @Get('employees/:employeeId')
  getEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Query('cycleStart') cycleStart?: string,
  ) {
    return this.salariesService.getEmployee(user, employeeId, cycleStart);
  }

  @Patch('employees/:employeeId')
  updateEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.salariesService.updateEmployee(user, employeeId, dto);
  }

  @Get('employees/:employeeId/history')
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    return this.salariesService.history(user, employeeId);
  }

  @Post('employees/:employeeId/payments')
  recordPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: RecordSalaryPaymentDto,
    @Query('cycleStart') cycleStart?: string,
  ) {
    return this.salariesService.recordPayment(
      user,
      employeeId,
      dto,
      cycleStart,
    );
  }

  @Post('payments/:paymentId/reverse')
  reversePayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: ReverseSalaryPaymentDto,
  ) {
    return this.salariesService.reversePayment(user, paymentId, dto);
  }
}
