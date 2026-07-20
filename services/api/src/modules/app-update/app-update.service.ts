import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateReleaseDto, UpdateReleaseDto } from './app-update.dto';
import { ReleaseStorageService } from './release-storage.service';

@Injectable()
export class AppUpdateService {
  private readonly logger = new Logger(AppUpdateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ReleaseStorageService,
  ) {}

  async checkUpdate(
    appName: string,
    currentBuild: number,
    platform = 'android',
  ) {
    const latestRelease = await this.prisma.appRelease.findFirst({
      where: { appName, platform, isActive: true },
      orderBy: { buildNumber: 'desc' },
    });

    if (!latestRelease) {
      return {
        updateAvailable: false,
        updateMode: 'none',
        forceUpdate: false,
        mustUpdate: false,
        currentBuild,
        latestBuild: currentBuild,
        latestVersion: null,
        minSupportedBuild: 1,
        apkUrl: null,
        apkHash: null,
        changelog: [],
        message: null,
      };
    }

    const isCurrentBuild = currentBuild >= latestRelease.buildNumber;
    const isBelowMinimum = currentBuild < latestRelease.minSupportedBuild;

    if (isCurrentBuild && latestRelease.updateMode === 'shorebird') {
      return {
        updateAvailable: true,
        updateMode: 'shorebird',
        forceUpdate: false,
        mustUpdate: false,
        currentBuild,
        latestBuild: latestRelease.buildNumber,
        latestVersion: latestRelease.version,
        minSupportedBuild: latestRelease.minSupportedBuild,
        apkUrl: null,
        apkHash: null,
        changelog: latestRelease.changelog,
        message: latestRelease.message,
      };
    }

    if (isCurrentBuild) {
      return {
        updateAvailable: false,
        updateMode: 'none',
        forceUpdate: false,
        mustUpdate: false,
        currentBuild,
        latestBuild: latestRelease.buildNumber,
        latestVersion: latestRelease.version,
        minSupportedBuild: latestRelease.minSupportedBuild,
        apkUrl: null,
        apkHash: null,
        changelog: [],
        message: null,
      };
    }

    let releaseToServe = latestRelease;

    if (latestRelease.updateMode === 'shorebird') {
      const latestFullRelease = await this.prisma.appRelease.findFirst({
        where: {
          appName,
          platform,
          isActive: true,
          updateMode: 'full',
          buildNumber: { gt: currentBuild },
        },
        orderBy: { buildNumber: 'desc' },
      });

      if (latestFullRelease) {
        releaseToServe = latestFullRelease;
      } else {
        return {
          updateAvailable: true,
          updateMode: 'shorebird',
          forceUpdate: false,
          mustUpdate: isBelowMinimum,
          currentBuild,
          latestBuild: latestRelease.buildNumber,
          latestVersion: latestRelease.version,
          minSupportedBuild: latestRelease.minSupportedBuild,
          apkUrl: null,
          apkHash: null,
          changelog: latestRelease.changelog,
          message: latestRelease.message,
        };
      }
    }

    const intermediateReleases = await this.prisma.appRelease.findMany({
      where: {
        appName,
        platform,
        isActive: true,
        buildNumber: { gt: currentBuild, lte: releaseToServe.buildNumber },
      },
      orderBy: { buildNumber: 'asc' },
      select: { changelog: true },
    });

    const aggregatedChangelog = intermediateReleases
      .flatMap((r) => r.changelog)
      .filter(Boolean);

    return {
      updateAvailable: true,
      updateMode: releaseToServe.updateMode,
      forceUpdate: releaseToServe.forceUpdate || isBelowMinimum,
      mustUpdate: isBelowMinimum,
      currentBuild,
      latestBuild: releaseToServe.buildNumber,
      latestVersion: releaseToServe.version,
      minSupportedBuild: releaseToServe.minSupportedBuild,
      apkUrl: releaseToServe.apkUrl
        ? await this.resolveDownloadUrl(releaseToServe.apkUrl)
        : null,
      apkHash: releaseToServe.apkHash,
      changelog: aggregatedChangelog,
      message: releaseToServe.message,
    };
  }

  private async resolveDownloadUrl(apkUrl: string): Promise<string> {
    if (apkUrl.startsWith('releases/')) {
      return this.storage.getPresignedDownloadUrl(apkUrl);
    }
    return apkUrl;
  }

  async getLatestDownloadUrl(appName: string, platform = 'android') {
    const latestRelease = await this.prisma.appRelease.findFirst({
      where: {
        appName,
        platform,
        isActive: true,
        updateMode: 'full',
      },
      orderBy: { buildNumber: 'desc' },
    });

    if (!latestRelease?.apkUrl) {
      throw new NotFoundException(
        `No downloadable release found for ${appName} on ${platform}.`,
      );
    }

    const downloadUrl = await this.resolveDownloadUrl(latestRelease.apkUrl);

    await this.prisma.appRelease.update({
      where: { id: latestRelease.id },
      data: { downloadCount: { increment: 1 } },
    });

    return {
      appName: latestRelease.appName,
      version: latestRelease.version,
      buildNumber: latestRelease.buildNumber,
      platform: latestRelease.platform,
      downloadUrl,
      apkHash: latestRelease.apkHash,
      changelog: latestRelease.changelog,
      message: latestRelease.message,
    };
  }

  async trackDownload(
    appName: string,
    buildNumber: number,
    platform = 'android',
  ) {
    try {
      await this.prisma.appRelease.updateMany({
        where: { appName, platform, buildNumber },
        data: { downloadCount: { increment: 1 } },
      });
    } catch {
      /* non-critical */
    }
    return { tracked: true };
  }

  async getUploadUrl(
    appName: string,
    platform: string,
    version: string,
    buildNumber: number,
  ) {
    return this.storage.getPresignedUploadUrl(
      appName,
      platform,
      version,
      buildNumber,
    );
  }

  async uploadApk(
    buffer: Buffer,
    appName: string,
    platform: string,
    version: string,
    buildNumber: number,
  ) {
    const result = await this.storage.uploadApk(
      buffer,
      appName,
      platform,
      version,
      buildNumber,
    );
    this.logger.log(
      `APK uploaded for ${appName}/${platform} v${version} build ${buildNumber}`,
    );
    return result;
  }

  async createRelease(dto: CreateReleaseDto) {
    const platform = dto.platform || 'android';

    if (dto.updateMode === 'full' && !dto.apkUrl) {
      throw new ConflictException(
        'Full releases must include an apkUrl (S3 key or direct URL).',
      );
    }

    const existing = await this.prisma.appRelease.findUnique({
      where: {
        appName_platform_buildNumber: {
          appName: dto.appName,
          platform,
          buildNumber: dto.buildNumber,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Release for ${dto.appName}/${platform} build ${dto.buildNumber} already exists.`,
      );
    }

    return this.prisma.appRelease.create({
      data: {
        appName: dto.appName,
        platform,
        version: dto.version,
        buildNumber: dto.buildNumber,
        updateMode: dto.updateMode,
        forceUpdate: dto.forceUpdate ?? false,
        minSupportedBuild: dto.minSupportedBuild ?? 1,
        apkUrl: dto.apkUrl,
        apkHash: dto.apkHash,
        changelog: dto.changelog ?? [],
        message: dto.message,
      },
    });
  }

  async updateRelease(id: string, dto: UpdateReleaseDto) {
    const release = await this.prisma.appRelease.findUnique({ where: { id } });
    if (!release) throw new NotFoundException('Release not found.');

    return this.prisma.appRelease.update({
      where: { id },
      data: {
        ...(dto.forceUpdate !== undefined && { forceUpdate: dto.forceUpdate }),
        ...(dto.minSupportedBuild !== undefined && {
          minSupportedBuild: dto.minSupportedBuild,
        }),
        ...(dto.apkUrl !== undefined && { apkUrl: dto.apkUrl }),
        ...(dto.apkHash !== undefined && { apkHash: dto.apkHash }),
        ...(dto.changelog !== undefined && { changelog: dto.changelog }),
        ...(dto.message !== undefined && { message: dto.message }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async listReleases(appName?: string, platform?: string) {
    return this.prisma.appRelease.findMany({
      where: {
        ...(appName && { appName }),
        ...(platform && { platform }),
      },
      orderBy: { buildNumber: 'desc' },
      take: 50,
    });
  }

  async getRelease(id: string) {
    const release = await this.prisma.appRelease.findUnique({ where: { id } });
    if (!release) throw new NotFoundException('Release not found.');
    return release;
  }
}
