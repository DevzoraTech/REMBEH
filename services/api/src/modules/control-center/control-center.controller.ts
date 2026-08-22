import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { ControlCenterAdminContext } from './control-center-admin';
import { ControlCenterAuthGuard } from './control-center-auth.guard';
import { ControlCenterService } from './control-center.service';
import { CurrentControlCenterAdmin } from './current-control-center-admin.decorator';
import {
  ControlCenterLoginDto,
  ControlCenterSetupDto,
} from './dto/control-center-auth.dto';
import { ControlCenterSendMessageDto } from './dto/control-center-message.dto';
import { ControlCenterSavePricingDto } from './dto/control-center-pricing.dto';
import { ControlCenterUpdateUserStatusDto } from './dto/control-center-users.dto';

@Controller('control-center')
export class ControlCenterController {
  constructor(private readonly controlCenterService: ControlCenterService) {}

  @Get('auth/status')
  authStatus(@Query('email') email?: string) {
    return this.controlCenterService.authStatus(email);
  }

  @Post('auth/setup')
  setup(@Body() body: ControlCenterSetupDto) {
    return this.controlCenterService.setup(body);
  }

  @Post('auth/login')
  login(@Body() body: ControlCenterLoginDto) {
    return this.controlCenterService.login(body);
  }

  @Get('me')
  @UseGuards(ControlCenterAuthGuard)
  me(@CurrentControlCenterAdmin() admin: ControlCenterAdminContext) {
    return this.controlCenterService.me(admin);
  }

  @Get('dashboard')
  @UseGuards(ControlCenterAuthGuard)
  dashboard() {
    return this.controlCenterService.dashboard();
  }

  @Get('clients')
  @UseGuards(ControlCenterAuthGuard)
  clients() {
    return this.controlCenterService.listClients();
  }

  @Get('clients/:tenantId')
  @UseGuards(ControlCenterAuthGuard)
  client(@Param('tenantId') tenantId: string) {
    return this.controlCenterService.getClient(tenantId);
  }

  @Get('clients/:tenantId/pricing')
  @UseGuards(ControlCenterAuthGuard)
  pricing(@Param('tenantId') tenantId: string) {
    return this.controlCenterService.getPricing(tenantId);
  }

  @Post('clients/:tenantId/pricing')
  @UseGuards(ControlCenterAuthGuard)
  saveOrganizationPricing(
    @CurrentControlCenterAdmin() admin: ControlCenterAdminContext,
    @Param('tenantId') tenantId: string,
    @Body() body: ControlCenterSavePricingDto,
  ) {
    return this.controlCenterService.saveOrganizationPricing(
      admin,
      tenantId,
      body,
    );
  }

  @Post('clients/:tenantId/branches/:branchId/pricing')
  @UseGuards(ControlCenterAuthGuard)
  saveBranchPricing(
    @CurrentControlCenterAdmin() admin: ControlCenterAdminContext,
    @Param('tenantId') tenantId: string,
    @Param('branchId') branchId: string,
    @Body() body: ControlCenterSavePricingDto,
  ) {
    return this.controlCenterService.saveBranchPricing(
      admin,
      tenantId,
      branchId,
      body,
    );
  }

  @Get('clients/:tenantId/pricing-history')
  @UseGuards(ControlCenterAuthGuard)
  pricingHistory(@Param('tenantId') tenantId: string) {
    return this.controlCenterService.pricingHistory(tenantId);
  }

  @Get('users')
  @UseGuards(ControlCenterAuthGuard)
  users() {
    return this.controlCenterService.listUsers();
  }

  @Patch('users/:userId/status')
  @UseGuards(ControlCenterAuthGuard)
  updateUserStatus(
    @CurrentControlCenterAdmin() admin: ControlCenterAdminContext,
    @Param('userId') userId: string,
    @Body() body: ControlCenterUpdateUserStatusDto,
  ) {
    return this.controlCenterService.updateUserStatus(admin, userId, body);
  }

  @Get('message-templates')
  @UseGuards(ControlCenterAuthGuard)
  messageTemplates() {
    return this.controlCenterService.listMessageTemplates();
  }

  @Post('messages/send')
  @UseGuards(ControlCenterAuthGuard)
  sendMessage(
    @CurrentControlCenterAdmin() admin: ControlCenterAdminContext,
    @Body() body: ControlCenterSendMessageDto,
  ) {
    return this.controlCenterService.sendMessage(admin, body);
  }
}
