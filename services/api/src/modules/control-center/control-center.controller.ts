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
import { ControlCenterUpdateMessageTemplateDto } from './dto/control-center-settings.dto';
import { ControlCenterAuditQueryDto } from './dto/control-center-audit-query.dto';
import { ControlCenterReportQueryDto } from './dto/control-center-report-query.dto';
import { ControlCenterMessageQueryDto } from './dto/control-center-message-query.dto';
import { ControlCenterAuthGuard } from './control-center-auth.guard';
import { ControlCenterService } from './control-center.service';
import { CurrentControlCenterAdmin } from './current-control-center-admin.decorator';
import { ControlCenterFeatureAccessDto } from './dto/control-center-feature-access.dto';
import {
  ControlCenterChangePasswordDto,
  ControlCenterLoginDto,
  ControlCenterSetupDto,
} from './dto/control-center-auth.dto';
import {
  ControlCenterRejectPaymentDto,
  ControlCenterVerifyPaymentDto,
} from './dto/control-center-payments.dto';
import { ControlCenterSendMessageDto } from './dto/control-center-message.dto';
import { ControlCenterSavePricingDto } from './dto/control-center-pricing.dto';
import { ControlCenterUpdateUserStatusDto } from './dto/control-center-users.dto';
import { MarketingService } from '../marketing/marketing.service';
import { AppUpdateService } from '../app-update/app-update.service';
import {
  AppUpdateScreenMediaPresignDto,
  SendReleaseDto,
  UpdateAppUpdateScreenDto,
  UpdateReleaseDto,
} from '../app-update/app-update.dto';
import {
  MarketingCampaignDto,
  MarketingCampaignStatusDto,
  MarketingMediaPresignDto,
  UpdateMarketingCampaignDto,
} from '../marketing/dto/marketing-campaign.dto';

@Controller('control-center')
export class ControlCenterController {
  constructor(
    private readonly controlCenterService: ControlCenterService,
    private readonly marketingService: MarketingService,
    private readonly appUpdateService: AppUpdateService,
  ) {}

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

  @Post('auth/change-password')
  @UseGuards(ControlCenterAuthGuard)
  changePassword(
    @CurrentControlCenterAdmin() admin: ControlCenterAdminContext,
    @Body() body: ControlCenterChangePasswordDto,
  ) {
    return this.controlCenterService.changePassword(admin, body);
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

  @Get('reports/overview')
  @UseGuards(ControlCenterAuthGuard)
  reportsOverview(@Query() query: ControlCenterReportQueryDto) {
    return this.controlCenterService.reportsOverview(query);
  }
  @Get('audit-logs')
  @UseGuards(ControlCenterAuthGuard)
  auditLogs(@Query() query: ControlCenterAuditQueryDto) {
    return this.controlCenterService.listAuditLogs(query);
  }

  @Get('settings')
  @UseGuards(ControlCenterAuthGuard)
  settings() {
    return this.controlCenterService.controlCenterSettings();
  }

  @Patch('message-templates/:templateId')
  @UseGuards(ControlCenterAuthGuard)
  updateMessageTemplate(
    @CurrentControlCenterAdmin() admin: ControlCenterAdminContext,
    @Param('templateId') templateId: string,
    @Body() body: ControlCenterUpdateMessageTemplateDto,
  ) {
    return this.controlCenterService.updateMessageTemplate(
      admin,
      templateId,
      body,
    );
  }

  @Get('clients')
  @UseGuards(ControlCenterAuthGuard)
  clients() {
    return this.controlCenterService.listClients();
  }

  @Get('subscriptions')
  @UseGuards(ControlCenterAuthGuard)
  subscriptions() {
    return this.controlCenterService.listSubscriptions();
  }

  @Get('payments')
  @UseGuards(ControlCenterAuthGuard)
  payments() {
    return this.controlCenterService.listPayments();
  }

  @Patch('payments/:paymentId/verify')
  @UseGuards(ControlCenterAuthGuard)
  verifyPayment(
    @CurrentControlCenterAdmin() admin: ControlCenterAdminContext,
    @Param('paymentId') paymentId: string,
    @Body() body: ControlCenterVerifyPaymentDto,
  ) {
    return this.controlCenterService.verifyPayment(admin, paymentId, body);
  }

  @Patch('payments/:paymentId/reject')
  @UseGuards(ControlCenterAuthGuard)
  rejectPayment(
    @CurrentControlCenterAdmin() admin: ControlCenterAdminContext,
    @Param('paymentId') paymentId: string,
    @Body() body: ControlCenterRejectPaymentDto,
  ) {
    return this.controlCenterService.rejectPayment(admin, paymentId, body);
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

  @Get('clients/:tenantId/data-correction-access')
  @UseGuards(ControlCenterAuthGuard)
  dataCorrectionAccess(@Param('tenantId') tenantId: string) {
    return this.controlCenterService.getDataCorrectionAccess(tenantId);
  }

  @Patch('clients/:tenantId/data-correction-access')
  @UseGuards(ControlCenterAuthGuard)
  updateOrganizationDataCorrectionAccess(
    @CurrentControlCenterAdmin() admin: ControlCenterAdminContext,
    @Param('tenantId') tenantId: string,
    @Body() body: ControlCenterFeatureAccessDto,
  ) {
    return this.controlCenterService.updateOrganizationDataCorrectionAccess(
      admin,
      tenantId,
      body,
    );
  }

  @Patch('clients/:tenantId/branches/:branchId/data-correction-access')
  @UseGuards(ControlCenterAuthGuard)
  updateBranchDataCorrectionAccess(
    @CurrentControlCenterAdmin() admin: ControlCenterAdminContext,
    @Param('tenantId') tenantId: string,
    @Param('branchId') branchId: string,
    @Body() body: ControlCenterFeatureAccessDto,
  ) {
    return this.controlCenterService.updateBranchDataCorrectionAccess(
      admin,
      tenantId,
      branchId,
      body,
    );
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

  @Get('messages')
  @UseGuards(ControlCenterAuthGuard)
  messages(@Query() query: ControlCenterMessageQueryDto) {
    return this.controlCenterService.listMessages(query);
  }

  @Post('messages/send')
  @UseGuards(ControlCenterAuthGuard)
  sendMessage(
    @CurrentControlCenterAdmin() admin: ControlCenterAdminContext,
    @Body() body: ControlCenterSendMessageDto,
  ) {
    return this.controlCenterService.sendMessage(admin, body);
  }

  @Get('marketing-campaigns')
  @UseGuards(ControlCenterAuthGuard)
  marketingCampaigns() {
    return this.marketingService.listControlCenterCampaigns();
  }

  @Post('marketing-campaigns/media/presign')
  @UseGuards(ControlCenterAuthGuard)
  presignMarketingMedia(
    @CurrentControlCenterAdmin() admin: ControlCenterAdminContext,
    @Body() body: MarketingMediaPresignDto,
  ) {
    return this.marketingService.presignControlCenterMedia(admin, body);
  }

  @Post('marketing-campaigns')
  @UseGuards(ControlCenterAuthGuard)
  createMarketingCampaign(
    @CurrentControlCenterAdmin() admin: ControlCenterAdminContext,
    @Body() body: MarketingCampaignDto,
  ) {
    return this.marketingService.createControlCenterCampaign(admin, body);
  }

  @Patch('marketing-campaigns/:campaignId')
  @UseGuards(ControlCenterAuthGuard)
  updateMarketingCampaign(
    @CurrentControlCenterAdmin() admin: ControlCenterAdminContext,
    @Param('campaignId') campaignId: string,
    @Body() body: UpdateMarketingCampaignDto,
  ) {
    return this.marketingService.updateControlCenterCampaign(
      admin,
      campaignId,
      body,
    );
  }

  @Patch('marketing-campaigns/:campaignId/status')
  @UseGuards(ControlCenterAuthGuard)
  updateMarketingCampaignStatus(
    @CurrentControlCenterAdmin() admin: ControlCenterAdminContext,
    @Param('campaignId') campaignId: string,
    @Body() body: MarketingCampaignStatusDto,
  ) {
    return this.marketingService.updateControlCenterCampaignStatus(
      admin,
      campaignId,
      body,
    );
  }

  @Get('app-releases')
  @UseGuards(ControlCenterAuthGuard)
  listAppReleases(
    @Query('app') app?: string,
    @Query('platform') platform?: string,
  ) {
    return this.appUpdateService.listReleases(app || 'mobile', platform);
  }

  @Get('app-release-organisations')
  @UseGuards(ControlCenterAuthGuard)
  listAppReleaseOrganisations() {
    return this.appUpdateService.listRolloutOrganisations();
  }

  @Patch('app-releases/:id')
  @UseGuards(ControlCenterAuthGuard)
  updateAppRelease(@Param('id') id: string, @Body() body: UpdateReleaseDto) {
    return this.appUpdateService.updateRelease(id, body);
  }

  @Post('app-releases/:id/send')
  @UseGuards(ControlCenterAuthGuard)
  sendAppRelease(@Param('id') id: string, @Body() body: SendReleaseDto) {
    return this.appUpdateService.sendRelease(id, body);
  }

  @Post('app-releases/:id/pause')
  @UseGuards(ControlCenterAuthGuard)
  pauseAppRelease(@Param('id') id: string) {
    return this.appUpdateService.pauseRelease(id);
  }

  @Post('app-releases/:id/promote')
  @UseGuards(ControlCenterAuthGuard)
  promoteAppRelease(@Param('id') id: string) {
    return this.appUpdateService.promoteReleaseToAll(id);
  }

  @Get('app-update-screen')
  @UseGuards(ControlCenterAuthGuard)
  getAppUpdateScreen() {
    return this.appUpdateService.getScreenContent();
  }

  @Patch('app-update-screen')
  @UseGuards(ControlCenterAuthGuard)
  updateAppUpdateScreen(@Body() body: UpdateAppUpdateScreenDto) {
    return this.appUpdateService.updateScreenContent(body);
  }

  @Post('app-update-screen/media/presign')
  @UseGuards(ControlCenterAuthGuard)
  presignAppUpdateScreenMedia(@Body() body: AppUpdateScreenMediaPresignDto) {
    return this.appUpdateService.presignScreenMedia(body);
  }
}
