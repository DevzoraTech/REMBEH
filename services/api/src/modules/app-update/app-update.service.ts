import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AppUpdateMediaType,
  AppUpdateScreenContent,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import {
  CreateReleaseDto,
  UpdateAppUpdateScreenDto,
  UpdateReleaseDto,
  AppUpdateScreenMediaPresignDto,
} from './app-update.dto';
import { ReleaseStorageService } from './release-storage.service';

const SCREEN_KEY = 'mobile';

const DEFAULT_WHATS_NEW = [
  {
    title: 'Works better offline',
    body: 'Improved offline reliability for your daily work.',
  },
  {
    title: 'Syncs latest records',
    body: 'Automatically syncs when internet returns.',
  },
  {
    title: 'Smoother daily operations',
    body: 'Enhanced performance and stability.',
  },
  {
    title: 'Improved repayment & salary screens',
    body: 'Easier to use and more reliable.',
  },
];

@Injectable()
export class AppUpdateService {
  private readonly logger = new Logger(AppUpdateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ReleaseStorageService,
    private readonly objectStorage: ObjectStorageService,
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

    const [apkUrl, apkSizeBytes, screen] = await Promise.all([
      releaseToServe.apkUrl
        ? this.resolveDownloadUrl(releaseToServe.apkUrl)
        : Promise.resolve(null),
      releaseToServe.apkUrl?.startsWith('releases/')
        ? this.storage
            .verifyExists(releaseToServe.apkUrl)
            .then((info) => info.sizeBytes ?? null)
        : Promise.resolve(null),
      this.toPublicScreen(await this.ensureScreenContent()),
    ]);

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
      apkUrl,
      apkHash: releaseToServe.apkHash,
      apkSizeBytes,
      changelog: aggregatedChangelog,
      message: releaseToServe.message,
      screen,
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

  async getScreenContent() {
    return this.toAdminScreen(await this.ensureScreenContent());
  }

  async updateScreenContent(dto: UpdateAppUpdateScreenDto) {
    const existing = await this.ensureScreenContent();
    const mediaType = dto.mediaType
      ? (dto.mediaType as AppUpdateMediaType)
      : existing.mediaType;
    const updated = await this.prisma.appUpdateScreenContent.update({
      where: { id: existing.id },
      data: {
        ...(dto.readyMessage !== undefined && {
          readyMessage: this.cleanNullable(dto.readyMessage),
        }),
        ...(dto.requiredMessage !== undefined && {
          requiredMessage: this.cleanNullable(dto.requiredMessage),
        }),
        ...(dto.whatsNewTitle !== undefined && {
          whatsNewTitle: dto.whatsNewTitle.trim(),
        }),
        ...(dto.whatsNewItems !== undefined && {
          whatsNewItems: this.normalizeWhatsNew(dto.whatsNewItems),
        }),
        ...(dto.mediaType !== undefined && { mediaType }),
        ...(dto.mediaUrl !== undefined && {
          mediaUrl: this.cleanNullable(dto.mediaUrl),
        }),
        ...(dto.mediaStorageKey !== undefined && {
          mediaStorageKey: this.cleanNullable(dto.mediaStorageKey),
        }),
        ...(dto.mediaTitle !== undefined && {
          mediaTitle: this.cleanNullable(dto.mediaTitle),
        }),
        ...(dto.mediaBody !== undefined && {
          mediaBody: this.cleanNullable(dto.mediaBody),
        }),
        ...(dto.mediaCtaLabel !== undefined && {
          mediaCtaLabel: this.cleanNullable(dto.mediaCtaLabel),
        }),
        ...(dto.stayConnectedTitle !== undefined && {
          stayConnectedTitle: this.cleanNullable(dto.stayConnectedTitle),
        }),
        ...(dto.stayConnectedBody !== undefined && {
          stayConnectedBody: this.cleanNullable(dto.stayConnectedBody),
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
    return this.toAdminScreen(updated);
  }

  async presignScreenMedia(dto: AppUpdateScreenMediaPresignDto) {
    const mimeType = dto.mimeType.trim().toLowerCase();
    const mediaType = mimeType.startsWith('image/')
      ? AppUpdateMediaType.IMAGE
      : mimeType.startsWith('video/')
        ? AppUpdateMediaType.VIDEO
        : null;
    if (!mediaType) {
      throw new BadRequestException('Choose an image or video file.');
    }
    const extension =
      dto.fileName
        ?.split('.')
        .pop()
        ?.toLowerCase()
        .replace(/[^a-z0-9]/g, '') ||
      mimeType.split('/').pop()?.replace(/[^a-z0-9]/g, '') ||
      'bin';
    const storageKey = `control-center/app-update/${randomUUID()}.${extension}`;
    const presigned = await this.objectStorage.presignPut({
      storageKey,
      mimeType,
      expiresInSeconds: 600,
    });
    return { ...presigned, mediaType };
  }

  private async ensureScreenContent() {
    const existing = await this.prisma.appUpdateScreenContent.findUnique({
      where: { key: SCREEN_KEY },
    });
    if (existing) return existing;
    return this.prisma.appUpdateScreenContent.create({
      data: {
        key: SCREEN_KEY,
        readyMessage: 'A new REMBEH update is ready.',
        requiredMessage: 'This update is required to continue using REMBEH.',
        whatsNewTitle: "What's new in this update",
        whatsNewItems: DEFAULT_WHATS_NEW,
        mediaType: AppUpdateMediaType.NONE,
        mediaTitle: "See what's new",
        mediaBody:
          'Watch a quick 1-minute video to see how this update makes REMBEH even better for you.',
        mediaCtaLabel: 'Watch video',
        stayConnectedTitle: 'Stay connected',
        stayConnectedBody:
          'Keep REMBEH open and stay connected to Wi-Fi for a faster and uninterrupted update.',
      },
    });
  }

  private async toPublicScreen(
    row: AppUpdateScreenContent,
  ) {
    if (!row.isActive) return null;
    const mediaUrl = await this.resolveScreenMediaUrl(row);
    return {
      readyMessage: row.readyMessage,
      requiredMessage: row.requiredMessage,
      whatsNewTitle: row.whatsNewTitle,
      whatsNew: this.readWhatsNew(row.whatsNewItems),
      promo:
        row.mediaType === AppUpdateMediaType.NONE || !mediaUrl
          ? null
          : {
              mediaType: row.mediaType,
              mediaUrl,
              title: row.mediaTitle,
              body: row.mediaBody,
              ctaLabel: row.mediaCtaLabel,
            },
      stayConnected: {
        title: row.stayConnectedTitle,
        body: row.stayConnectedBody,
      },
    };
  }

  private async toAdminScreen(
    row: AppUpdateScreenContent,
  ) {
    const mediaPreviewUrl = await this.resolveScreenMediaUrl(row);
    return {
      id: row.id,
      readyMessage: row.readyMessage,
      requiredMessage: row.requiredMessage,
      whatsNewTitle: row.whatsNewTitle,
      whatsNewItems: this.readWhatsNew(row.whatsNewItems),
      mediaType: row.mediaType,
      mediaUrl: row.mediaUrl,
      mediaStorageKey: row.mediaStorageKey,
      mediaPreviewUrl,
      mediaTitle: row.mediaTitle,
      mediaBody: row.mediaBody,
      mediaCtaLabel: row.mediaCtaLabel,
      stayConnectedTitle: row.stayConnectedTitle,
      stayConnectedBody: row.stayConnectedBody,
      isActive: row.isActive,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async resolveScreenMediaUrl(row: {
    mediaType: AppUpdateMediaType;
    mediaUrl: string | null;
    mediaStorageKey: string | null;
  }) {
    if (row.mediaType === AppUpdateMediaType.NONE) return null;
    if (row.mediaStorageKey) {
      const signed = await this.objectStorage.presignGet({
        storageKey: row.mediaStorageKey,
        expiresInSeconds: 21600,
      });
      return signed.downloadUrl;
    }
    return row.mediaUrl;
  }

  private readWhatsNew(value: Prisma.JsonValue): Array<{
    title: string;
    body: string | null;
  }> {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          if (typeof item === 'string' && item.trim()) {
            return { title: item.trim(), body: null };
          }
          return null;
        }
        const record = item as { title?: unknown; body?: unknown };
        const title = String(record.title ?? '').trim();
        if (!title) return null;
        const body = String(record.body ?? '').trim();
        return { title, body: body || null };
      })
      .filter((item): item is { title: string; body: string | null } =>
        Boolean(item),
      );
  }

  private normalizeWhatsNew(items: Array<{ title: string; body?: string | null }>) {
    return items
      .map((item) => ({
        title: item.title.trim(),
        body: item.body?.trim() || null,
      }))
      .filter((item) => item.title.length > 0);
  }

  private cleanNullable(value: string | null | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }
}
