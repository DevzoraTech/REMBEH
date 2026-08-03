import {
  DeleteObjectCommand,
  GetObjectCommand,
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

export type PresignGetResult = {
  downloadUrl: string;
  storageKey: string;
  expiresInSeconds: number;
};

export type SignatureObjectKeys = {
  assetId: string;
  signaturePngKey: string;
  strokesJsonKey: string;
  metadataJsonKey: string;
};

/**
 * Organised object layout (never dump at bucket root):
 *
 * tenants/{organisationId}/                         # organisation
 *   meta/company.json
 *   products/...
 *   branches/{branchId}/                            # branch
 *     media/{mediaType}/{applicationId}/...         # file type
 *     signatures/{signerRole}/{applicationId}/...
 *     loan-agreements/{applicationId}/...
 *     agent-profiles/{userId}/...
 *
 * Existing objects keep their stored keys in the DB; only new writes use
 * this layout.
 */
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
      this.configService.get<string>('S3_REGION')?.trim() || 'eu-north-1';
    const accessKeyId =
      this.configService.get<string>('S3_ACCESS_KEY')?.trim() ?? '';
    const secretAccessKey =
      this.configService.get<string>('S3_SECRET_KEY')?.trim() ?? '';
    this.bucket =
      this.configService.get<string>('S3_BUCKET')?.trim() || 'rembeh-local';

    // Explicit keys (local/dev) OR omit credentials so the default provider
    // chain is used (EC2 instance role / ECS task role / env AWS_*).
    const credentials =
      accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined;
    const authMode = credentials
      ? 'static-keys'
      : 'default-provider-chain (EC2 IAM role)';

    // Path-style only for custom endpoints (MinIO). AWS S3 uses virtual-hosted.
    const usePathStyle = Boolean(endpoint);

    this.client = new S3Client({
      region,
      endpoint,
      forcePathStyle: usePathStyle,
      ...(credentials ? { credentials } : {}),
    });

    this.presignClient = new S3Client({
      region,
      endpoint: publicEndpoint,
      forcePathStyle: Boolean(publicEndpoint),
      ...(credentials ? { credentials } : {}),
    });

    this.logger.log(
      `Object storage ready (bucket=${this.bucket}, region=${region}, mode=${endpoint ? 'custom-endpoint' : 'aws-s3'}, auth=${authMode})`,
    );
  }

  /** tenants/{organisationId}/ */
  buildTenantPrefix(tenantId: string) {
    return `tenants/${sanitizePathSegment(tenantId)}/`;
  }

  /** tenants/{organisationId}/branches/{branchId}/ */
  buildBranchPrefix(tenantId: string, branchId: string) {
    return `${this.buildTenantPrefix(tenantId)}branches/${sanitizePathSegment(branchId)}/`;
  }

  /** tenants/{organisationId}/meta/company.json */
  buildTenantCompanyMetaKey(tenantId: string) {
    return `${this.buildTenantPrefix(tenantId)}meta/company.json`;
  }

  /** tenants/{organisationId}/products/{name} */
  buildTenantProductConfigKey(tenantId: string, name: string) {
    const safe = sanitizePathSegment(name.toLowerCase());
    return `${this.buildTenantPrefix(tenantId)}products/${safe}`;
  }

  /**
   * Creates the organisation root marker object so every company has a
   * dedicated prefix from registration day one.
   */
  async provisionTenantPrefix(input: {
    tenantId: string;
    name: string;
    country: string;
    currency: string;
  }) {
    const storagePrefix = this.buildTenantPrefix(input.tenantId);
    const metaKey = this.buildTenantCompanyMetaKey(input.tenantId);
    const body = JSON.stringify(
      {
        tenantId: input.tenantId,
        name: input.name,
        country: input.country,
        currency: input.currency,
        storagePrefix,
        provisionedAt: new Date().toISOString(),
      },
      null,
      2,
    );

    await this.upload({
      storageKey: metaKey,
      body,
      mimeType: 'application/json',
    });

    return { storagePrefix, metaKey };
  }

  /**
   * Loan media:
   * tenants/{org}/branches/{branch}/media/{mediaType}/{applicationId}/{uuid}.{ext}
   */
  buildObjectKey(input: {
    tenantId: string;
    branchId: string;
    applicationId: string;
    mediaType: string;
    extension?: string;
  }) {
    return this.buildMediaObjectKey(input);
  }

  buildMediaObjectKey(input: {
    tenantId: string;
    branchId: string;
    applicationId: string;
    mediaType: string;
    extension?: string;
  }) {
    const ext = sanitizeExtension(input.extension) || 'bin';
    const mediaType = sanitizePathSegment(input.mediaType.toLowerCase());
    const applicationId = sanitizePathSegment(input.applicationId);
    return `${this.buildBranchPrefix(input.tenantId, input.branchId)}media/${mediaType}/${applicationId}/${randomUUID()}.${ext}`;
  }

  /**
   * Agent profile selfie:
   * tenants/{org}/branches/{branch}/agent-profiles/{userId}/{uuid}.{ext}
   */
  buildAgentProfilePhotoKey(input: {
    tenantId: string;
    branchId: string;
    userId: string;
    extension?: string;
  }) {
    const ext = sanitizeExtension(input.extension) || 'jpg';
    const userId = sanitizePathSegment(input.userId);
    return `${this.buildBranchPrefix(input.tenantId, input.branchId)}agent-profiles/${userId}/${randomUUID()}.${ext}`;
  }

  /**
   * Accepts current and legacy agent-profile key prefixes so in-flight
   * uploads / older objects still confirm cleanly.
   */
  isAgentProfilePhotoKey(input: {
    tenantId: string;
    userId: string;
    storageKey: string;
  }) {
    const tenant = sanitizePathSegment(input.tenantId);
    const userId = sanitizePathSegment(input.userId);
    const modern = new RegExp(
      `^tenants/${tenant}/branches/[^/]+/agent-profiles/${userId}/`,
    );
    const legacy = `tenants/${tenant}/agents/${userId}/profile/`;
    return (
      modern.test(input.storageKey) || input.storageKey.startsWith(legacy)
    );
  }

  /**
   * Signature assets:
   * tenants/{org}/branches/{branch}/signatures/{signerRole}/{applicationId}/{uuid}/
   *   signature.png | strokes.json | metadata.json
   */
  buildSignatureObjectKeys(input: {
    tenantId: string;
    branchId: string;
    applicationId: string;
    signerRole: string;
  }): SignatureObjectKeys {
    const role = sanitizePathSegment(input.signerRole.toLowerCase());
    const applicationId = sanitizePathSegment(input.applicationId);
    const assetId = randomUUID();
    const base = `${this.buildBranchPrefix(input.tenantId, input.branchId)}signatures/${role}/${applicationId}/${assetId}`;
    return {
      assetId,
      signaturePngKey: `${base}/signature.png`,
      strokesJsonKey: `${base}/strokes.json`,
      metadataJsonKey: `${base}/metadata.json`,
    };
  }

  /**
   * Signed loan agreement:
   * tenants/{org}/branches/{branch}/loan-agreements/{applicationId}/SignedLoanAgreement-{version}.pdf
   */
  buildSignedAgreementKey(input: {
    tenantId: string;
    branchId: string;
    applicationId: string;
    version: number;
  }) {
    const applicationId = sanitizePathSegment(input.applicationId);
    return `${this.buildBranchPrefix(input.tenantId, input.branchId)}loan-agreements/${applicationId}/SignedLoanAgreement-${input.version}.pdf`;
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

  async presignGet(input: {
    storageKey: string;
    expiresInSeconds?: number;
  }): Promise<PresignGetResult> {
    const expiresInSeconds =
      input.expiresInSeconds ?? this.defaultExpiresInSeconds;
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: input.storageKey,
    });
    const downloadUrl = await getSignedUrl(this.presignClient, command, {
      expiresIn: expiresInSeconds,
    });

    return {
      downloadUrl,
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

  async getObjectBytes(storageKey: string): Promise<Buffer | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
        }),
      );
      if (!result.Body) return null;
      const bytes = await result.Body.transformToByteArray();
      return Buffer.from(bytes);
    } catch (error) {
      this.logger.warn(
        `Failed to read object ${storageKey}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
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

function sanitizeExtension(extension?: string) {
  if (!extension) return undefined;
  return extension
    .replace(/^\./, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function sanitizePathSegment(value: string) {
  return value.replace(/[^a-z0-9_-]/gi, '_');
}
