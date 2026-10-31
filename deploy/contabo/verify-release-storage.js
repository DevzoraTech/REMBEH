const { randomUUID } = require('node:crypto');
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { ReleaseStorageService } = require('/app/services/api/dist/src/modules/app-update/release-storage.service.js');

const storage = new ReleaseStorageService({ get: (key) => process.env[key] });
const client = new S3Client({
  region: process.env.S3_REGION,
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
});
const version = `migration-${randomUUID()}`;
const body = Buffer.from(randomUUID());
const keys = [1, 2].map((build) =>
  storage.buildS3Key('migration-check', 'android', version, build),
);

async function main() {
  try {
    await storage.uploadApk(body, 'migration-check', 'android', version, 1);
    const upload = await storage.getPresignedUploadUrl('migration-check', 'android', version, 2);
    const put = await fetch(upload.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/vnd.android.package-archive' },
      body,
    });
    if (!put.ok) throw new Error(`Presigned upload returned HTTP ${put.status}`);
    for (const key of keys) {
      const url = await storage.getPresignedDownloadUrl(key);
      const response = await fetch(url);
      if (!response.ok || !Buffer.from(await response.arrayBuffer()).equals(body)) {
        throw new Error(`Release download verification failed: HTTP ${response.status}`);
      }
    }
    console.log('RELEASE_UPLOAD_AND_DOWNLOAD_VERIFIED');
  } finally {
    for (const Key of keys) {
      await client.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key }));
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
