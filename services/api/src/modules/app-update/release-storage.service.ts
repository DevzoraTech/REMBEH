import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetBucketAccelerateConfigurationCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'node:crypto';

/**
 * APK / bundle storage under private bucket prefix:
 *   releases/mobile/android/line-{epoch}/build-{n}/rembeh-v{version}.apk
 */
@Injectable()
export class ReleaseStorageService {
  private readonly logger = new Logger(ReleaseStorageService.name);
  private readonly s3Client: S3Client;
  private readonly presignClient: S3Client;
  private readonly accelerateClient: S3Client | null;
  private readonly bucket: string;
  private readonly downloadExpiry = 21600;
  private readonly cdnBase: string | null;
  private accelerateEnabled: Promise<boolean> | null = null;

  constructor(private readonly configService: ConfigService) {
    const endpoint = emptyToUndefined(
      this.configService.get<string>('S3_ENDPOINT'),
    );
    const publicEndpoint =
      emptyToUndefined(this.configService.get<string>('S3_PUBLIC_ENDPOINT')) ||
      endpoint;
    const region =
      this.configService.get<string>('S3_REGION')?.trim() || 'eu-north-1';
    const accessKeyId =
      this.configService.get<string>('S3_ACCESS_KEY')?.trim() ?? '';
    const secretAccessKey =
      this.configService.get<string>('S3_SECRET_KEY')?.trim() ?? '';
    this.bucket =
      this.configService.get<string>('S3_BUCKET')?.trim() ||
      'rembeh-prod-bucket';
    this.cdnBase =
      emptyToUndefined(this.configService.get<string>('S3_DOWNLOAD_CDN')) ??
      null;

    const credentials =
      accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined;

    this.s3Client = new S3Client({
      region,
      endpoint,
      forcePathStyle: Boolean(endpoint),
      ...(credentials ? { credentials } : {}),
    });
    this.presignClient = new S3Client({
      region,
      endpoint: publicEndpoint,
      forcePathStyle: Boolean(publicEndpoint),
      ...(credentials ? { credentials } : {}),
    });
    this.accelerateClient = endpoint
      ? null
      : new S3Client({
          region,
          useAccelerateEndpoint: true,
          ...(credentials ? { credentials } : {}),
        });

    this.logger.log(
      `Release storage ready (bucket=${this.bucket}, region=${region})`,
    );
  }

  buildS3Key(
    appName: string,
    platform: string,
    version: string,
    buildNumber: number,
    releaseEpoch = 1,
  ): string {
    const safeApp = sanitize(appName);
    const safePlatform = sanitize(platform);
    const safeVersion = sanitize(version);
    return `releases/${safeApp}/${safePlatform}/line-${releaseEpoch}/build-${buildNumber}/rembeh-v${safeVersion}.apk`;
  }

  async uploadApk(
    buffer: Buffer,
    appName: string,
    platform: string,
    version: string,
    buildNumber: number,
    releaseEpoch = 1,
  ): Promise<{ s3Key: string; sha256Hash: string; sizeBytes: number }> {
    const s3Key = this.buildS3Key(
      appName,
      platform,
      version,
      buildNumber,
      releaseEpoch,
    );
    const sha256Hash = crypto.createHash('sha256').update(buffer).digest('hex');

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
        Body: buffer,
        ContentType: 'application/vnd.android.package-archive',
        ServerSideEncryption: 'AES256',
        Metadata: {
          'app-name': appName,
          'app-version': version,
          'release-epoch': String(releaseEpoch),
          'build-number': String(buildNumber),
          'sha256-hash': sha256Hash,
        },
      }),
    );

    this.logger.log(
      `APK uploaded ${s3Key} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`,
    );

    return { s3Key, sha256Hash, sizeBytes: buffer.length };
  }

  async getPresignedDownloadUrl(s3Key: string): Promise<string> {
    const publicBase = emptyToUndefined(
      this.configService.get<string>('APK_PUBLIC_BASE_URL'),
    );
    if (publicBase) {
      const fileName = s3Key.split('/').pop();
      if (fileName) {
        return `${publicBase.replace(/\/$/, '')}/${fileName}`;
      }
    }
    if (this.cdnBase) {
      return `${this.cdnBase.replace(/\/$/, '')}/${s3Key}`;
    }

    const useAccelerate = await this.canAccelerate();
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      ResponseContentType: 'application/vnd.android.package-archive',
    });
    return getSignedUrl(
      useAccelerate && this.accelerateClient
        ? this.accelerateClient
        : this.presignClient,
      command,
      { expiresIn: this.downloadExpiry },
    );
  }

  async getPresignedUploadUrl(
    appName: string,
    platform: string,
    version: string,
    buildNumber: number,
    releaseEpoch = 1,
  ): Promise<{ uploadUrl: string; s3Key: string }> {
    const s3Key = this.buildS3Key(
      appName,
      platform,
      version,
      buildNumber,
      releaseEpoch,
    );
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      ContentType: 'application/vnd.android.package-archive',
      ServerSideEncryption: 'AES256',
    });
    const uploadUrl = await getSignedUrl(this.presignClient, command, {
      expiresIn: 900,
    });
    return { uploadUrl, s3Key };
  }

  async verifyExists(
    s3Key: string,
  ): Promise<{ exists: boolean; sizeBytes?: number }> {
    try {
      const response = await this.s3Client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: s3Key }),
      );
      return { exists: true, sizeBytes: response.ContentLength };
    } catch {
      return { exists: false };
    }
  }

  private async canAccelerate(): Promise<boolean> {
    if (!this.accelerateClient) return false;
    const forced = this.configService
      .get<string>('S3_DOWNLOAD_ACCELERATE')
      ?.trim();
    if (forced === '0' || forced === 'false') return false;
    if (this.accelerateEnabled) return this.accelerateEnabled;
    this.accelerateEnabled = this.detectAccelerate(forced === '1');
    return this.accelerateEnabled;
  }

  private async detectAccelerate(prefer: boolean): Promise<boolean> {
    try {
      const response = await this.s3Client.send(
        new GetBucketAccelerateConfigurationCommand({ Bucket: this.bucket }),
      );
      const enabled = response.Status === 'Enabled';
      this.logger.log(
        `S3 Transfer Acceleration ${enabled ? 'ON' : 'off'} for ${this.bucket}`,
      );
      return enabled;
    } catch (error) {
      this.logger.warn(
        `Could not read S3 Transfer Acceleration; using direct S3. ${
          error instanceof Error ? error.message : error
        }`,
      );
      return prefer;
    }
  }
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase();
}
