import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { SyncService } from './sync.service';
import { GetSnapshotDto } from './dto/get-snapshot.dto';
import { UploadQueueDto } from './dto/upload-queue.dto';
import { SYNC_PERMISSIONS } from './sync.permissions';

@Controller('sync')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get('snapshot')
  @RequirePermissions(SYNC_PERMISSIONS.download)
  async getSnapshot(
    @CurrentUser() user: AuthenticatedUser,
    @Query() dto: GetSnapshotDto,
  ) {
    return this.syncService.generateSnapshot(user, dto.lastSyncAt);
  }

  @Post('upload-queue')
  @RequirePermissions(SYNC_PERMISSIONS.upload)
  async uploadQueue(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UploadQueueDto,
  ) {
    return this.syncService.processOperationQueue(user, dto.operations);
  }
}
