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
    currentReleaseEpoch = 1,
  ) {
    const latestRelease = await this.prisma.appRelease.findFirst({
      where: { appName, platform, isActive: true },
      orderBy: [
        { releaseEpoch: 'desc' },
        { buildNumber: 'desc' },
        { updatedAt: 'desc' },
      ],
    });

    if (!latestRelease) {
      return {
        updateAvailable: false,
        updateMode: 'none',
        forceUpdate: false,
        mustUpdate: false,
        currentBuild,
        currentReleaseEpoch,
        latestBuild: currentBuild,
        latestReleaseEpoch: currentReleaseEpoch,
        latestVersion: null,
        minSupportedBuild: 1,
        apkUrl: null,
        apkHash: null,
        changelog: [],
        message: null,
      };
    }

    const isNewerLine = currentReleaseEpoch > latestRelease.releaseEpoch;
    const isSameLine = currentReleaseEpoch === latestRelease.releaseEpoch;
    const isCurrentBuild =
      isNewerLine || (isSameLine && currentBuild >= latestRelease.buildNumber);
    const isBelowMinimum =
      currentReleaseEpoch < latestRelease.releaseEpoch ||
      (isSameLine && currentBuild < latestRelease.minSupportedBuild);

    if (isCurrentBuild && latestRelease.updateMode === 'shorebird') {
      return {
        updateAvailable: true,
        updateMode: 'shorebird',
        forceUpdate: false,
        mustUpdate: false,
        currentBuild,
        currentReleaseEpoch,
        latestBuild: latestRelease.buildNumber,
        latestReleaseEpoch: latestRelease.releaseEpoch,
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
        currentReleaseEpoch,
        latestBuild: latestRelease.buildNumber,
        latestReleaseEpoch: latestRelease.releaseEpoch,
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
          OR: [
            { releaseEpoch: { gt: currentReleaseEpoch } },
            {
              releaseEpoch: currentReleaseEpoch,
              buildNumber: { gt: currentBuild },
            },
          ],
        },
        orderBy: [
          { releaseEpoch: 'desc' },
          { buildNumber: 'desc' },
          { updatedAt: 'desc' },
        ],
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
          currentReleaseEpoch,
          latestBuild: latestRelease.buildNumber,
          latestReleaseEpoch: latestRelease.releaseEpoch,
          latestVersion: latestRelease.version,
          minSupportedBuild: latestRelease.minSupportedBuild,
          apkUrl: null,
          apkHash: null,
          changelog: latestRelease.changelog,
          message: latestRelease.message,
        };
      }
    }

    const intermediateReleases =
      currentReleaseEpoch === releaseToServe.releaseEpoch
        ? await this.prisma.appRelease.findMany({
            where: {
              appName,
              platform,
              isActive: true,
              releaseEpoch: releaseToServe.releaseEpoch,
              buildNumber: {
                gt: currentBuild,
                lte: releaseToServe.buildNumber,
              },
            },
            orderBy: [{ buildNumber: 'asc' }, { updatedAt: 'asc' }],
            select: { changelog: true },
          })
        : await this.prisma.appRelease.findMany({
            where: {
              appName,
              platform,
              isActive: true,
              OR: [
                {
                  releaseEpoch: {
                    gt: currentReleaseEpoch,
                    lt: releaseToServe.releaseEpoch,
                  },
                },
                {
                  releaseEpoch: releaseToServe.releaseEpoch,
                  buildNumber: { lte: releaseToServe.buildNumber },
                },
              ],
            },
            orderBy: [
              { releaseEpoch: 'asc' },
              { buildNumber: 'asc' },
              { updatedAt: 'asc' },
            ],
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
      currentReleaseEpoch,
      latestBuild: releaseToServe.buildNumber,
      latestReleaseEpoch: releaseToServe.releaseEpoch,
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
      orderBy: [
        { releaseEpoch: 'desc' },
        { buildNumber: 'desc' },
        { updatedAt: 'desc' },
      ],
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
      releaseEpoch: latestRelease.releaseEpoch,
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
    releaseEpoch?: number,
  ) {
    try {
      await this.prisma.appRelease.updateMany({
        where: {
          appName,
          platform,
          buildNumber,
          ...(releaseEpoch !== undefined && { releaseEpoch }),
        },
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
    releaseEpoch = 1,
  ) {
    return this.storage.getPresignedUploadUrl(
      appName,
      platform,
      version,
      buildNumber,
      releaseEpoch,
    );
  }

  async uploadApk(
    buffer: Buffer,
    appName: string,
    platform: string,
    version: string,
    buildNumber: number,
    releaseEpoch = 1,
  ) {
    const result = await this.storage.uploadApk(
      buffer,
      appName,
      platform,
      version,
      buildNumber,
      releaseEpoch,
    );
    this.logger.log(
      `APK uploaded for ${appName}/${platform} v${version} build ${buildNumber}`,
    );
    return result;
  }

  async createRelease(dto: CreateReleaseDto) {
    const platform = dto.platform || 'android';
    const releaseEpoch = dto.releaseEpoch ?? 1;

    if (dto.updateMode === 'full' && !dto.apkUrl) {
      throw new ConflictException(
        'Full releases must include an apkUrl (S3 key or direct URL).',
      );
    }

    const existing = await this.prisma.appRelease.findUnique({
      where: {
        appName_platform_releaseEpoch_buildNumber: {
          appName: dto.appName,
          platform,
          releaseEpoch,
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
        releaseEpoch,
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
        ...(dto.releaseEpoch !== undefined && {
          releaseEpoch: dto.releaseEpoch,
        }),
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
      orderBy: [
        { releaseEpoch: 'desc' },
        { buildNumber: 'desc' },
        { updatedAt: 'desc' },
      ],
      take: 50,
    });
  }

  async getRelease(id: string) {
    const release = await this.prisma.appRelease.findUnique({ where: { id } });
    if (!release) throw new NotFoundException('Release not found.');
    return release;
  }
}
