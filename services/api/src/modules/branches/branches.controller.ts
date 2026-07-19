import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { BRANCH_PERMISSIONS } from './branches.permissions';
import { BranchesService } from './branches.service';
import { AcceptBranchStaffInvitationDto } from './dto/accept-branch-staff-invitation.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { InviteBranchStaffDto } from './dto/invite-branch-staff.dto';
import { LookupBranchStaffInvitationDto } from './dto/lookup-branch-staff-invitation.dto';

@Controller('branches')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Get()
  @RequirePermissions(BRANCH_PERMISSIONS.read)
  listBranches(@CurrentUser() user: AuthenticatedUser) {
    return this.branchesService.listBranches(user);
  }

  @Post()
  @RequirePermissions(BRANCH_PERMISSIONS.create)
  createBranch(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBranchDto,
  ) {
    return this.branchesService.createBranch(user, dto);
  }

  @Get(':branchId/staff')
  @RequirePermissions(BRANCH_PERMISSIONS.staffRead)
  listBranchStaff(
    @CurrentUser() user: AuthenticatedUser,
    @Param('branchId') branchId: string,
  ) {
    return this.branchesService.listBranchStaff(user, branchId);
  }

  @Post(':branchId/staff-invitations')
  @RequirePermissions(BRANCH_PERMISSIONS.staffInvite)
  inviteBranchStaff(
    @CurrentUser() user: AuthenticatedUser,
    @Param('branchId') branchId: string,
    @Body() dto: InviteBranchStaffDto,
  ) {
    return this.branchesService.inviteBranchStaff(user, branchId, dto);
  }
}

@Controller('branch-staff/invitations')
export class BranchStaffInvitationsController {
  constructor(private readonly branchesService: BranchesService) {}

  @Post('lookup')
  lookupInvitation(@Body() dto: LookupBranchStaffInvitationDto) {
    return this.branchesService.lookupStaffInvitation(dto);
  }

  @Post('accept')
  acceptInvitation(@Body() dto: AcceptBranchStaffInvitationDto) {
    return this.branchesService.acceptStaffInvitation(dto);
  }
}
