#!/usr/bin/env bash
# Register a mobile APK from the EC2 host without an admin JWT.
# Uses EC2 IAM role for S3 + Prisma for app_releases.
#
# Production safety:
# - Production .env is server-owned.
# - Refuses to run unless DB/S3 match the expected production infrastructure.
# - Refuses static S3 credentials.
#
# Usage:
#   ./scripts/register-mobile-apk-on-ec2.sh \
#     --apk /path/to/app-release.apk \
#     --version 1.0.0 \
#     --build 1 \
#     [--message "..."] \
#     [--changelog "item one,item two"] \
#     [--force] \
#     [--min-build 1]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

APK=""
VERSION=""
BUILD=""
MESSAGE="First production APK"
CHANGELOG_CSV=""
FORCE_UPDATE="false"
MIN_BUILD="1"
APP_NAME="mobile"
PLATFORM="android"

API_URL="${REMBEH_API_URL:-https://rembeh-api.antikra.com/api/v1}"

EXPECTED_DB_HOST="${EXPECTED_DB_HOST:-rembeh-production-db.c9i86weakejt.af-south-1.rds.amazonaws.com}"
EXPECTED_DB_NAME="${EXPECTED_DB_NAME:-rembeh}"
EXPECTED_S3_BUCKET="${EXPECTED_S3_BUCKET:-rembeh-production-file-bk}"
EXPECTED_S3_REGION="${EXPECTED_S3_REGION:-af-south-1}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apk)
      APK="$2"
      shift 2
      ;;
    --version|-v)
      VERSION="$2"
      shift 2
      ;;
    --build|-b)
      BUILD="$2"
      shift 2
      ;;
    --message|-m)
      MESSAGE="$2"
      shift 2
      ;;
    --changelog|-c)
      CHANGELOG_CSV="$2"
      shift 2
      ;;
    --force)
      FORCE_UPDATE="true"
      shift
      ;;
    --min-build)
      MIN_BUILD="$2"
      shift 2
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
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

if [[ ! -f "$ROOT/.env" ]]; then
  echo "ERROR: Missing production env: $ROOT/.env" >&2
  exit 1
fi

# ----------------------------------------------------------------------
# Load and verify production environment BEFORE any S3/DB mutation
# ----------------------------------------------------------------------

set -a
# shellcheck disable=SC1091
. "$ROOT/.env"
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is unset." >&2
  exit 1
fi

if [[ "$DATABASE_URL" != *"$EXPECTED_DB_HOST"* ]]; then
  echo "ERROR: Wrong production DB host." >&2
  echo "Expected: $EXPECTED_DB_HOST" >&2
  exit 1
fi

if [[ "$DATABASE_URL" != *"/$EXPECTED_DB_NAME"* ]]; then
  echo "ERROR: Wrong production DB name." >&2
  echo "Expected: $EXPECTED_DB_NAME" >&2
  exit 1
fi

if [[ "${S3_BUCKET:-}" != "$EXPECTED_S3_BUCKET" ]]; then
  echo "ERROR: Wrong S3_BUCKET." >&2
  echo "Expected: $EXPECTED_S3_BUCKET" >&2
  echo "Actual:   ${S3_BUCKET:-<unset>}" >&2
  exit 1
fi

if [[ "${S3_REGION:-}" != "$EXPECTED_S3_REGION" ]]; then
  echo "ERROR: Wrong S3_REGION." >&2
  echo "Expected: $EXPECTED_S3_REGION" >&2
  echo "Actual:   ${S3_REGION:-<unset>}" >&2
  exit 1
fi

if [[ -n "${S3_ACCESS_KEY:-}" || -n "${S3_SECRET_KEY:-}" ]]; then
  echo "ERROR: Static S3 credentials found." >&2
  echo "Production must use the EC2 IAM role." >&2
  exit 1
fi

if [[ -n "${S3_ENDPOINT:-}" ]]; then
  echo "ERROR: S3_ENDPOINT must be empty for AWS production S3." >&2
  exit 1
fi

echo "Production infrastructure verified:"
echo "  DB host : $EXPECTED_DB_HOST"
echo "  DB name : $EXPECTED_DB_NAME"
echo "  S3      : $EXPECTED_S3_BUCKET"
echo "  Region  : $EXPECTED_S3_REGION"

# ----------------------------------------------------------------------
# Release metadata
# ----------------------------------------------------------------------

S3_KEY="releases/${APP_NAME}/${PLATFORM}/build-${BUILD}/rembeh-v${VERSION}.apk"

HASH="$(shasum -a 256 "$APK" | awk '{print $1}')"
SIZE="$(wc -c <"$APK" | tr -d ' ')"

if [[ -n "$CHANGELOG_CSV" ]]; then
  CHANGELOG_JSON="$(
    python3 -c \
      "import json,sys; print(json.dumps([x.strip() for x in sys.argv[1].split(',') if x.strip()]))" \
      "$CHANGELOG_CSV"
  )"
else
  CHANGELOG_JSON='[]'
fi

# ----------------------------------------------------------------------
# Upload APK to production S3
# ----------------------------------------------------------------------

echo "==> Uploading $APK → s3://$S3_BUCKET/$S3_KEY"

APK_PATH="$APK" \
APK_HASH="$HASH" \
S3_KEY="$S3_KEY" \
APP_NAME="$APP_NAME" \
VERSION="$VERSION" \
BUILD="$BUILD" \
EXPECTED_S3_BUCKET="$EXPECTED_S3_BUCKET" \
EXPECTED_S3_REGION="$EXPECTED_S3_REGION" \
node <<'NODE'
const fs = require('fs');
const { S3Client, PutObjectCommand, HeadObjectCommand } =
  require('@aws-sdk/client-s3');
const { createHash } = require('crypto');

async function main() {
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION;

  if (!bucket || !region) {
    throw new Error('S3_BUCKET or S3_REGION missing.');
  }

  if (bucket !== process.env.EXPECTED_S3_BUCKET) {
    throw new Error(`Safety check failed: unexpected S3 bucket ${bucket}`);
  }

  if (region !== process.env.EXPECTED_S3_REGION) {
    throw new Error(`Safety check failed: unexpected S3 region ${region}`);
  }

  const endpoint = (process.env.S3_ENDPOINT || '').trim();

  if (endpoint) {
    throw new Error(
      `Safety check failed: S3_ENDPOINT must be empty in production.`,
    );
  }

  const accessKeyId = (process.env.S3_ACCESS_KEY || '').trim();
  const secretAccessKey = (process.env.S3_SECRET_KEY || '').trim();

  if (accessKeyId || secretAccessKey) {
    throw new Error(
      'Safety check failed: static S3 credentials are not allowed in production.',
    );
  }

  const client = new S3Client({
    region,
    // No explicit credentials:
    // AWS SDK uses EC2 IAM instance-role credentials.
  });

  const body = fs.readFileSync(process.env.APK_PATH);

  const hash = createHash('sha256')
    .update(body)
    .digest('hex');

  if (hash !== process.env.APK_HASH) {
    throw new Error('Hash mismatch before upload.');
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

  // Verify that the object really exists after upload.
  const head = await client.send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: process.env.S3_KEY,
    }),
  );

  console.log(
    JSON.stringify({
      uploaded: process.env.S3_KEY,
      sizeMB: (body.length / 1024 / 1024).toFixed(2),
      contentLength: head.ContentLength,
      etag: head.ETag,
    }),
  );
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
NODE

# ----------------------------------------------------------------------
# Register release in production DB
# ----------------------------------------------------------------------

echo "==> Registering release in production Postgres via Prisma..."

APK_HASH="$HASH" \
S3_KEY="$S3_KEY" \
APP_NAME="$APP_NAME" \
VERSION="$VERSION" \
BUILD="$BUILD" \
MESSAGE="$MESSAGE" \
PLATFORM="$PLATFORM" \
FORCE_UPDATE="$FORCE_UPDATE" \
MIN_BUILD="$MIN_BUILD" \
CHANGELOG_JSON="$CHANGELOG_JSON" \
EXPECTED_DB_HOST="$EXPECTED_DB_HOST" \
EXPECTED_DB_NAME="$EXPECTED_DB_NAME" \
node <<'NODE'
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not configured.');
  }

  if (!databaseUrl.includes(process.env.EXPECTED_DB_HOST)) {
    throw new Error(
      `Safety check failed: DATABASE_URL does not point to ${process.env.EXPECTED_DB_HOST}`,
    );
  }

  if (!databaseUrl.includes(`/${process.env.EXPECTED_DB_NAME}`)) {
    throw new Error(
      `Safety check failed: DATABASE_URL does not point to database ${process.env.EXPECTED_DB_NAME}`,
    );
  }

  const pool = new Pool({
    connectionString: databaseUrl,
  });

  const prisma = new PrismaClient({
    adapter: new PrismaPg(pool),
  });

  try {
    // Verify actual connected DB before mutation.
    const actualDb = await prisma.$queryRawUnsafe(
      'select current_database() as database, current_user as username, inet_server_addr()::text as server_ip',
    );

    const row = actualDb?.[0];

    if (!row || row.database !== process.env.EXPECTED_DB_NAME) {
      throw new Error(
        `Connected to unexpected database: ${row?.database || '<unknown>'}`,
      );
    }

    const buildNumber = Number.parseInt(
      process.env.BUILD,
      10,
    );

    const minSupportedBuild = Number.parseInt(
      process.env.MIN_BUILD || '1',
      10,
    );

    if (!Number.isInteger(buildNumber) || buildNumber < 1) {
      throw new Error(`Invalid BUILD: ${process.env.BUILD}`);
    }

    if (!Number.isInteger(minSupportedBuild) || minSupportedBuild < 1) {
      throw new Error(
        `Invalid MIN_BUILD: ${process.env.MIN_BUILD}`,
      );
    }

    const changelog = JSON.parse(
      process.env.CHANGELOG_JSON || '[]',
    );

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
      forceUpdate: process.env.FORCE_UPDATE === 'true',
      minSupportedBuild,
      apkUrl: process.env.S3_KEY,
      apkHash: process.env.APK_HASH,
      changelog: changelog.length
        ? changelog
        : ['Mobile app update'],
      message: process.env.MESSAGE || null,
      isActive: true,
    };

    const release = existing
      ? await prisma.appRelease.update({
          where: {
            id: existing.id,
          },
          data,
        })
      : await prisma.appRelease.create({
          data,
        });

    console.log(
      JSON.stringify({
        id: release.id,
        version: release.version,
        buildNumber: release.buildNumber,
        forceUpdate: release.forceUpdate,
        minSupportedBuild: release.minSupportedBuild,
        s3Key: release.apkUrl,
        database: row.database,
        dbUser: row.username,
        dbServerIp: row.server_ip,
      }),
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
NODE

# ----------------------------------------------------------------------
# Verify public API resolves the registered release
# ----------------------------------------------------------------------

echo "==> Verifying public download endpoint..."

curl -fsS \
  --max-time 20 \
  "$API_URL/app/download/mobile?platform=android" |
  head -c 500

echo
echo
echo "Release registration OK"
echo "Version : ${VERSION}+${BUILD}"
echo "S3 key  : ${S3_KEY}"
echo "SHA-256 : ${HASH}"
echo "Size     : ${SIZE} bytes"