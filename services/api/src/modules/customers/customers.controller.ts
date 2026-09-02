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
import { CUSTOMER_PERMISSIONS } from './customers.permissions';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { VoidCustomerDto } from './dto/void-customer.dto';
import { BRANCH_PERMISSIONS } from '../branches/branches.permissions';

@Controller('customers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @RequirePermissions(CUSTOMER_PERMISSIONS.read)
  listCustomers(
    @CurrentUser() user: AuthenticatedUser,
    @Query('branchId') branchId?: string,
  ) {
    return this.customersService.listCustomers(user, branchId);
  }

  @Get(':customerId')
  @RequirePermissions(CUSTOMER_PERMISSIONS.read)
  getCustomer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return this.customersService.getCustomer(user, customerId);
  }

  @Post()
  @RequirePermissions(CUSTOMER_PERMISSIONS.create)
  createCustomer(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.customersService.createCustomer(user, dto);
  }

  @Post(':customerId/void')
  @RequirePermissions(BRANCH_PERMISSIONS.create)
  voidCustomer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: VoidCustomerDto,
  ) {
    return this.customersService.voidCustomer(user, customerId, dto);
  }

  @Post(':customerId/restore')
  @RequirePermissions(BRANCH_PERMISSIONS.create)
  restoreCustomer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return this.customersService.restoreCustomer(user, customerId);
  }
}
