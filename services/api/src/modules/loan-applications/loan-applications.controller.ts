import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { MediaConfirmDto, MediaPresignDto } from './dto/media-presign.dto';
import {
  SignatureConfirmDto,
  SignaturePresignDto,
} from './dto/signature.dto';
import { UpdateLoanApplicationDto } from './dto/update-loan-application.dto';
import { VerifyApplicantDto } from './dto/verify-applicant.dto';
import { LOAN_APPLICATION_PERMISSIONS } from './loan-applications.permissions';
import { LoanApplicationsService } from './loan-applications.service';

@Controller('loan-applications')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LoanApplicationsController {
  constructor(
    private readonly loanApplicationsService: LoanApplicationsService,
  ) {}

  @Get()
  @RequirePermissions(LOAN_APPLICATION_PERMISSIONS.read)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.loanApplicationsService.listApplications(user);
  }

  @Post()
  @RequirePermissions(LOAN_APPLICATION_PERMISSIONS.create)
  create(@CurrentUser() user: AuthenticatedUser) {
    return this.loanApplicationsService.createDraft(user);
  }

  @Get(':id')
  @RequirePermissions(LOAN_APPLICATION_PERMISSIONS.read)
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.loanApplicationsService.getApplication(user, id);
  }

  @Patch(':id')
  @RequirePermissions(LOAN_APPLICATION_PERMISSIONS.create)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLoanApplicationDto,
  ) {
    return this.loanApplicationsService.updateApplication(user, id, dto);
  }

  @Post(':id/verify-applicant')
  @RequirePermissions(LOAN_APPLICATION_PERMISSIONS.create)
  verifyApplicant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyApplicantDto,
  ) {
    return this.loanApplicationsService.verifyApplicant(user, id, dto);
  }

  @Post(':id/media/presign')
  @RequirePermissions(LOAN_APPLICATION_PERMISSIONS.create)
  presignMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MediaPresignDto,
  ) {
    return this.loanApplicationsService.presignMedia(user, id, dto);
  }

  @Post(':id/media/confirm')
  @RequirePermissions(LOAN_APPLICATION_PERMISSIONS.create)
  confirmMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MediaConfirmDto,
  ) {
    return this.loanApplicationsService.confirmMedia(user, id, dto);
  }

  @Post(':id/signatures/presign')
  @RequirePermissions(LOAN_APPLICATION_PERMISSIONS.create)
  presignSignature(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SignaturePresignDto,
  ) {
    return this.loanApplicationsService.presignSignature(user, id, dto);
  }

  @Post(':id/signatures/confirm')
  @RequirePermissions(LOAN_APPLICATION_PERMISSIONS.create)
  confirmSignature(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SignatureConfirmDto,
  ) {
    return this.loanApplicationsService.confirmSignature(user, id, dto);
  }

  @Post(':id/submit')
  @RequirePermissions(LOAN_APPLICATION_PERMISSIONS.create)
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.loanApplicationsService.submit(user, id);
  }
}
