import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import {
  CreateReleaseDto,
  TrackDownloadDto,
  UpdateReleaseDto,
  UploadUrlDto,
} from './app-update.dto';
import { AppUpdateService } from './app-update.service';

@Controller('app')
export class AppUpdateController {
  constructor(private readonly appUpdateService: AppUpdateService) {}

  @Get('check-update')
  async checkUpdate(
    @Query('app') app: string,
    @Query('appName') appName: string | undefined,
    @Query('currentBuild', ParseIntPipe) currentBuild: number,
    @Query('platform') platform?: string,
    @Query('currentReleaseEpoch') currentReleaseEpoch?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.appUpdateService.checkUpdate(
      app || appName || 'mobile',
      currentBuild,
      platform || 'android',
      parseOptionalPositiveInt(currentReleaseEpoch, 1),
      parseOptionalUuid(tenantId),
    );
  }

  /** Website / public: latest full APK download URL (presigned). */
  @Get('download/:appName')
  async getLatestDownload(
    @Param('appName') appName: string,
    @Query('platform') platform?: string,
  ) {
    // Allow /app/download/android as a convenience alias for mobile+android.
    if (appName === 'android' || appName === 'ios') {
      return this.appUpdateService.getLatestDownloadUrl('mobile', appName);
    }
    return this.appUpdateService.getLatestDownloadUrl(
      appName,
      platform || 'android',
    );
  }

  @Post('track-download')
  async trackDownload(@Body() body: TrackDownloadDto) {
    return this.appUpdateService.trackDownload(
      body.app,
      body.buildNumber,
      body.platform || 'android',
      body.releaseEpoch,
    );
  }

  @Post('upload-url')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('workspace.update')
  async getUploadUrl(@Body() body: UploadUrlDto) {
    return this.appUpdateService.getUploadUrl(
      body.appName,
      body.platform || 'android',
      body.version,
      body.buildNumber,
      body.releaseEpoch ?? 1,
    );
  }

  @Post('upload-apk')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('workspace.update')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 200 * 1024 * 1024 } }),
  )
  async uploadApk(
    @UploadedFile()
    file: { buffer: Buffer; originalname: string } | undefined,
    @Body()
    body: {
      appName: string;
      platform?: string;
      version: string;
      releaseEpoch?: string;
      buildNumber: string;
    },
  ) {
    if (!file) throw new BadRequestException('APK file is required.');
    if (!file.originalname.toLowerCase().endsWith('.apk')) {
      throw new BadRequestException('File must be an .apk');
    }
    return this.appUpdateService.uploadApk(
      file.buffer,
      body.appName,
      body.platform || 'android',
      body.version,
      parseInt(body.buildNumber, 10),
      parseOptionalPositiveInt(body.releaseEpoch, 1),
    );
  }

  @Post('releases')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('workspace.update')
  async createRelease(@Body() dto: CreateReleaseDto) {
    return this.appUpdateService.createRelease({
      ...dto,
      audience: undefined,
      tenantIds: undefined,
    });
  }

  @Get('releases')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('workspace.read')
  async listReleases(
    @Query('app') app?: string,
    @Query('platform') platform?: string,
  ) {
    return this.appUpdateService.listReleases(app, platform);
  }

  @Get('releases/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('workspace.read')
  async getRelease(@Param('id') id: string) {
    return this.appUpdateService.getRelease(id);
  }

  @Patch('releases/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('workspace.update')
  async updateRelease(@Param('id') id: string, @Body() dto: UpdateReleaseDto) {
    return this.appUpdateService.updateRelease(id, {
      ...dto,
      audience: undefined,
      tenantIds: undefined,
    });
  }
}

function parseOptionalPositiveInt(value: string | undefined, fallback: number) {
  if (value == null || value === '') return fallback;

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequestException('Release epoch must be a positive integer.');
  }

  return parsed;
}

function parseOptionalUuid(value: string | undefined) {
  if (value == null || value === '') return undefined;
  const trimmed = value.trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      trimmed,
    )
  ) {
    throw new BadRequestException('Organisation id must be a valid UUID.');
  }
  return trimmed;
}
