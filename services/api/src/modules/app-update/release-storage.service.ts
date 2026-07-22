import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'node:crypto';

/**
 * APK / bundle storage under private bucket prefix:
 *   releases/mobile/android/build-{n}/rembeh-v{version}.apk
 */
@Injectable()
export class ReleaseStorageService {
  private readonly logger = new Logger(ReleaseStorageService.name);
  private readonly s3Client: S3Client;
  private readonly presignClient: S3Client;
  private readonly bucket: string;
  private readonly downloadExpiry = 3600;

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

    this.logger.log(
      `Release storage ready (bucket=${this.bucket}, region=${region})`,
    );
  }

  buildS3Key(
    appName: string,
    platform: string,
    version: string,
    buildNumber: number,
  ): string {
    const safeApp = sanitize(appName);
    const safePlatform = sanitize(platform);
    const safeVersion = sanitize(version);
    return `releases/${safeApp}/${safePlatform}/build-${buildNumber}/rembeh-v${safeVersion}.apk`;
  }

  async uploadApk(
    buffer: Buffer,
    appName: string,
    platform: string,
    version: string,
    buildNumber: number,
  ): Promise<{ s3Key: string; sha256Hash: string; sizeBytes: number }> {
    const s3Key = this.buildS3Key(appName, platform, version, buildNumber);
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
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      ResponseContentType: 'application/vnd.android.package-archive',
      ResponseContentDisposition: `attachment; filename="${s3Key.split('/').pop()}"`,
    });
    return getSignedUrl(this.presignClient, command, {
      expiresIn: this.downloadExpiry,
    });
  }

  async getPresignedUploadUrl(
    appName: string,
    platform: string,
    version: string,
    buildNumber: number,
  ): Promise<{ uploadUrl: string; s3Key: string }> {
    const s3Key = this.buildS3Key(appName, platform, version, buildNumber);
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
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase();
}
