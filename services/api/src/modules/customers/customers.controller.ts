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
import { CUSTOMER_PERMISSIONS } from './customers.permissions';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';

@Controller('customers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @RequirePermissions(CUSTOMER_PERMISSIONS.read)
  listCustomers(@CurrentUser() user: AuthenticatedUser) {
    return this.customersService.listCustomers(user);
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
}
