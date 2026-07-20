#!/usr/bin/env bash
# Register a mobile APK from the EC2 host without an admin JWT.
# Uses instance IAM / env S3 credentials + Prisma to insert app_releases.
#
# Usage (on EC2 or after scp of APK):
#   ./scripts/register-mobile-apk-on-ec2.sh \
#     --apk /path/to/app-release.apk \
#     --version 1.0.0 \
#     --build 1 \
#     [--message "..."]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APK=""
VERSION=""
BUILD=""
MESSAGE="First production APK"
APP_NAME="mobile"
PLATFORM="android"
API_URL="${REMBEH_API_URL:-https://rembeh-api.antikra.com/api/v1}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apk) APK="$2"; shift 2 ;;
    --version|-v) VERSION="$2"; shift 2 ;;
    --build|-b) BUILD="$2"; shift 2 ;;
    --message|-m) MESSAGE="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$APK" || -z "$VERSION" || -z "$BUILD" ]]; then
  echo "Required: --apk --version --build" >&2
  exit 1
fi
if [[ ! -f "$APK" ]]; then
  echo "APK not found: $APK" >&2
  exit 1
fi

cd "$ROOT"
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

S3_KEY="releases/${APP_NAME}/${PLATFORM}/build-${BUILD}/rembeh-v${VERSION}.apk"
HASH="$(shasum -a 256 "$APK" | awk '{print $1}')"
SIZE="$(wc -c <"$APK" | tr -d ' ')"

echo "==> Uploading $APK → s3://${S3_BUCKET:-rembeh-prod-bucket}/$S3_KEY"
APK_PATH="$APK" APK_HASH="$HASH" S3_KEY="$S3_KEY" APP_NAME="$APP_NAME" VERSION="$VERSION" BUILD="$BUILD" \
node <<'NODE'
const fs = require('fs');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { createHash } = require('crypto');

async function main() {
  const bucket = process.env.S3_BUCKET || 'rembeh-prod-bucket';
  const region = process.env.S3_REGION || 'eu-north-1';
  const endpoint = process.env.S3_ENDPOINT || undefined;
  const accessKeyId = (process.env.S3_ACCESS_KEY || '').trim();
  const secretAccessKey = (process.env.S3_SECRET_KEY || '').trim();
  const credentials =
    accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined;
  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle: Boolean(endpoint),
    ...(credentials ? { credentials } : {}),
  });
  const body = fs.readFileSync(process.env.APK_PATH);
  const hash = createHash('sha256').update(body).digest('hex');
  if (hash !== process.env.APK_HASH) {
    throw new Error('Hash mismatch before upload');
  }
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: process.env.S3_KEY,
      Body: body,
      ContentType: 'application/vnd.android.package-archive',
      ServerSideEncryption: 'AES256',
      Metadata: {
        'app-name': process.env.APP_NAME,
        'app-version': process.env.VERSION,
        'build-number': process.env.BUILD,
        'sha256-hash': hash,
      },
    }),
  );
  console.log('uploaded', process.env.S3_KEY, (body.length / 1024 / 1024).toFixed(2) + 'MB');
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
NODE

echo "==> Registering release in Postgres via Prisma..."
APK_PATH="$APK" APK_HASH="$HASH" S3_KEY="$S3_KEY" APP_NAME="$APP_NAME" VERSION="$VERSION" BUILD="$BUILD" MESSAGE="$MESSAGE" PLATFORM="$PLATFORM" \
node <<'NODE'
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const buildNumber = parseInt(process.env.BUILD, 10);
    const existing = await prisma.appRelease.findFirst({
      where: {
        appName: process.env.APP_NAME,
        platform: process.env.PLATFORM,
        buildNumber,
      },
    });
    const data = {
      appName: process.env.APP_NAME,
      platform: process.env.PLATFORM,
      version: process.env.VERSION,
      buildNumber,
      updateMode: 'full',
      forceUpdate: false,
      minSupportedBuild: 1,
      apkUrl: process.env.S3_KEY,
      apkHash: process.env.APK_HASH,
      changelog: ['First production APK'],
      message: process.env.MESSAGE || null,
      isActive: true,
    };
    const row = existing
      ? await prisma.appRelease.update({ where: { id: existing.id }, data })
      : await prisma.appRelease.create({ data });
    console.log(
      JSON.stringify({
        id: row.id,
        version: row.version,
        buildNumber: row.buildNumber,
        s3Key: row.apkUrl,
      }),
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
NODE

echo "==> Verifying public download endpoint..."
curl -fsS "$API_URL/app/download/mobile?platform=android" | head -c 500
echo
echo "OK"
