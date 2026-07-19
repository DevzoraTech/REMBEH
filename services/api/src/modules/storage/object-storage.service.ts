import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

export type PresignPutResult = {
  uploadUrl: string;
  storageKey: string;
  expiresInSeconds: number;
};

@Injectable()
export class ObjectStorageService implements OnModuleInit {
  private readonly logger = new Logger(ObjectStorageService.name);
  /** Used for server-side uploads (can be localhost). */
  private client!: S3Client;
  /** Used for device-facing presigned URLs (must be LAN/public reachable). */
  private presignClient!: S3Client;
  private bucket!: string;
  private readonly defaultExpiresInSeconds = 900;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    // Empty S3_ENDPOINT → real AWS S3. Set S3_ENDPOINT for MinIO/local only.
    const endpoint = emptyToUndefined(
      this.configService.get<string>('S3_ENDPOINT'),
    );
    const publicEndpoint =
      emptyToUndefined(this.configService.get<string>('S3_PUBLIC_ENDPOINT')) ||
      endpoint;
    const region =
      this.configService.get<string>('S3_REGION')?.trim() || 'us-east-1';
    const accessKeyId =
      this.configService.get<string>('S3_ACCESS_KEY')?.trim() ?? '';
    const secretAccessKey =
      this.configService.get<string>('S3_SECRET_KEY')?.trim() ?? '';
    this.bucket =
      this.configService.get<string>('S3_BUCKET')?.trim() || 'rembeh-local';

    const credentials =
      accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined;

    // Path-style only for custom endpoints (MinIO). AWS S3 uses virtual-hosted.
    const usePathStyle = Boolean(endpoint);

    this.client = new S3Client({
      region,
      endpoint,
      forcePathStyle: usePathStyle,
      credentials,
    });

    this.presignClient = new S3Client({
      region,
      endpoint: publicEndpoint,
      forcePathStyle: Boolean(publicEndpoint),
      credentials,
    });

    this.logger.log(
      `Object storage ready (bucket=${this.bucket}, region=${region}, mode=${endpoint ? 'custom-endpoint' : 'aws-s3'})`,
    );
  }

  buildObjectKey(input: {
    tenantId: string;
    applicationId: string;
    mediaType: string;
    extension?: string;
  }) {
    const ext = input.extension?.replace(/^\./, '') || 'bin';
    return `tenants/${input.tenantId}/loan-applications/${input.applicationId}/${input.mediaType.toLowerCase()}-${randomUUID()}.${ext}`;
  }

  async presignPut(input: {
    storageKey: string;
    mimeType: string;
    expiresInSeconds?: number;
  }): Promise<PresignPutResult> {
    const expiresInSeconds =
      input.expiresInSeconds ?? this.defaultExpiresInSeconds;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.storageKey,
      ContentType: input.mimeType,
    });
    // Sign against the public endpoint so phones can upload to MinIO/S3.
    const uploadUrl = await getSignedUrl(this.presignClient, command, {
      expiresIn: expiresInSeconds,
    });

    return {
      uploadUrl,
      storageKey: input.storageKey,
      expiresInSeconds,
    };
  }

  async upload(input: {
    storageKey: string;
    body: Buffer | Uint8Array | string;
    mimeType: string;
  }) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.storageKey,
        Body: input.body,
        ContentType: input.mimeType,
      }),
    );

    return { storageKey: input.storageKey };
  }

  async delete(storageKey: string) {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      }),
    );
  }
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
