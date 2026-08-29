#!/usr/bin/env bash
# Build a REMBEH Android APK, upload it through the production EC2 host,
# upload it to production S3, and register it as a mobile release.
#
# Production safety:
# - Production .env lives only on EC2.
# - This script NEVER uploads/replaces .env.
# - Before reading/writing AppRelease records, the EC2 production DB host,
#   database name, S3 bucket and S3 region are verified.
#
# Usage:
#   ./scripts/build-forced-mobile-release.sh
#   ./scripts/build-forced-mobile-release.sh \
#     --message "A new REMBEH update is ready"
#   ./scripts/build-forced-mobile-release.sh \
#     --changelog "Works better offline,Syncs latest records faster"
#
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PUBSPEC="$ROOT/apps/mobile/pubspec.yaml"
MOBILE_DIR="$ROOT/apps/mobile"
PROD_DEFINES="$MOBILE_DIR/dart_defines.prod.json"
APK_PATH="$MOBILE_DIR/build/app/outputs/flutter-apk/app-release.apk"

# ----------------------------------------------------------------------
# Production infrastructure
# ----------------------------------------------------------------------

HOST="${EC2_HOST:-15.240.28.47}"
USER_NAME="${EC2_USER:-ubuntu}"
REMOTE_DIR="${EC2_REMOTE_DIR:-/home/ubuntu/rembeh}"

REPO_URL="${REPO_URL:-https://github.com/DevzoraTech/REMBEH.git}"
BRANCH="${BRANCH:-main}"

API_URL="${REMBEH_API_URL:-https://rembeh-api.antikra.com/api/v1}"

EXPECTED_DB_HOST="${EXPECTED_DB_HOST:-rembeh-production-db.c9i86weakejt.af-south-1.rds.amazonaws.com}"
EXPECTED_DB_NAME="${EXPECTED_DB_NAME:-rembeh}"
EXPECTED_S3_BUCKET="${EXPECTED_S3_BUCKET:-rembeh-production-file-bk}"
EXPECTED_S3_REGION="${EXPECTED_S3_REGION:-af-south-1}"

APP_NAME="mobile"
PLATFORM="android"

MESSAGE="A new REMBEH update is ready."
CHANGELOG_CSV="Works better offline,Syncs latest records when internet returns,Keeps daily work smoother,Improves repayment and salary screens"

INCREMENT_MODE="patch"
FORCE_UPDATE="true"
SKIP_BUILD="false"
SKIP_REGISTER="false"
DRY_RUN="false"
MIN_BUILD=""

usage() {
  cat <<USAGE
Build and publish a REMBEH Android release.

Options:
  --message TEXT
      Friendly update prompt shown to users.

  --changelog CSV
      Comma-separated What's New entries.

  --increment MODE
      patch, minor, major, build, or none.
      Default: patch.

  --min-build NUMBER
      Minimum supported build.
      Default: newly generated build number.

  --no-force
      Register as an optional update.

  --skip-build
      Reuse:
      apps/mobile/build/app/outputs/flutter-apk/app-release.apk

  --no-register
      Build only; do not upload/register.

  --dry-run
      Calculate version/build only.

  -h, --help
      Show this help.

Environment:
  EC2_HOST
  EC2_USER
  EC2_REMOTE_DIR
  EC2_KEY
  EC2_SSH_KEY
  REMBEH_API_URL

Production safety overrides:
  EXPECTED_DB_HOST
  EXPECTED_DB_NAME
  EXPECTED_S3_BUCKET
  EXPECTED_S3_REGION
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --message|-m)
      MESSAGE="$2"
      shift 2
      ;;
    --changelog|-c)
      CHANGELOG_CSV="$2"
      shift 2
      ;;
    --increment)
      INCREMENT_MODE="$2"
      shift 2
      ;;
    --min-build)
      MIN_BUILD="$2"
      shift 2
      ;;
    --no-force)
      FORCE_UPDATE="false"
      shift
      ;;
    --skip-build)
      SKIP_BUILD="true"
      shift
      ;;
    --no-register)
      SKIP_REGISTER="true"
      shift
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

case "$INCREMENT_MODE" in
  patch|minor|major|build|none)
    ;;
  *)
    echo "--increment must be patch, minor, major, build, or none" >&2
    exit 1
    ;;
esac

if [[ ! -f "$PUBSPEC" ]]; then
  echo "Missing mobile pubspec: $PUBSPEC" >&2
  exit 1
fi

# shellcheck source=scripts/lib/ec2-ssh.sh
source "$ROOT/scripts/lib/ec2-ssh.sh"

trap ec2_ssh_cleanup EXIT
ec2_resolve_key

# ----------------------------------------------------------------------
# Version helpers
# ----------------------------------------------------------------------

read_current_version() {
  local line

  line="$(
    sed -nE \
      's/^version:[[:space:]]*([0-9]+)\.([0-9]+)\.([0-9]+)\+([0-9]+).*/\1 \2 \3 \4/p' \
      "$PUBSPEC" |
      head -1
  )"

  if [[ -z "$line" ]]; then
    echo "Could not parse version from $PUBSPEC" >&2
    exit 1
  fi

  echo "$line"
}

version_string() {
  echo "$1.$2.$3"
}

bump_version() {
  local major="$1"
  local minor="$2"
  local patch="$3"
  local build="$4"

  case "$INCREMENT_MODE" in
    major)
      major=$((major + 1))
      minor=0
      patch=0
      build=$((build + 1))
      ;;

    minor)
      minor=$((minor + 1))
      patch=0
      build=$((build + 1))
      ;;

    patch)
      patch=$((patch + 1))
      build=$((build + 1))
      ;;

    build)
      build=$((build + 1))
      ;;

    none)
      # A distinct store/release build is still required.
      build=$((build + 1))
      ;;
  esac

  echo "$major $minor $patch $build"
}

write_pubspec_version() {
  local version="$1"
  local build="$2"

  perl -0pi -e \
    "s/^version:\\s*[^\\n]+/version: ${version}+${build}/m" \
    "$PUBSPEC"
}

# ----------------------------------------------------------------------
# Production safety check
# ----------------------------------------------------------------------

verify_remote_production_environment() {
  echo "==> Verifying EC2 production environment..."

  ec2_ssh "$USER_NAME@$HOST" \
    bash -s -- \
    "$REMOTE_DIR" \
    "$EXPECTED_DB_HOST" \
    "$EXPECTED_DB_NAME" \
    "$EXPECTED_S3_BUCKET" \
    "$EXPECTED_S3_REGION" <<'REMOTE'
set -euo pipefail

REMOTE_DIR="$1"
EXPECTED_DB_HOST="$2"
EXPECTED_DB_NAME="$3"
EXPECTED_S3_BUCKET="$4"
EXPECTED_S3_REGION="$5"

ENV_FILE="$REMOTE_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: Missing production env: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is unset." >&2
  exit 1
fi

if [[ "$DATABASE_URL" != *"$EXPECTED_DB_HOST"* ]]; then
  echo "ERROR: Refusing release — wrong production database host." >&2
  echo "Expected: $EXPECTED_DB_HOST" >&2
  exit 1
fi

if [[ "$DATABASE_URL" != *"/$EXPECTED_DB_NAME"* ]]; then
  echo "ERROR: Refusing release — wrong database name." >&2
  echo "Expected: $EXPECTED_DB_NAME" >&2
  exit 1
fi

if [[ "${S3_BUCKET:-}" != "$EXPECTED_S3_BUCKET" ]]; then
  echo "ERROR: Refusing release — wrong S3 bucket." >&2
  echo "Expected: $EXPECTED_S3_BUCKET" >&2
  echo "Actual:   ${S3_BUCKET:-<unset>}" >&2
  exit 1
fi

if [[ "${S3_REGION:-}" != "$EXPECTED_S3_REGION" ]]; then
  echo "ERROR: Refusing release — wrong S3 region." >&2
  echo "Expected: $EXPECTED_S3_REGION" >&2
  echo "Actual:   ${S3_REGION:-<unset>}" >&2
  exit 1
fi

if [[ -n "${S3_ACCESS_KEY:-}" || -n "${S3_SECRET_KEY:-}" ]]; then
  echo "ERROR: Static S3 credentials found." >&2
  echo "Production must use the EC2 IAM role." >&2
  exit 1
fi

echo "Production infrastructure verified:"
echo "  DB host : $EXPECTED_DB_HOST"
echo "  DB name : $EXPECTED_DB_NAME"
echo "  S3      : $EXPECTED_S3_BUCKET"
echo "  Region  : $EXPECTED_S3_REGION"
REMOTE
}

# ----------------------------------------------------------------------
# Check release build number on production DB
# ----------------------------------------------------------------------

remote_release_exists() {
  local version="$1"
  local build="$2"

  ec2_ssh "$USER_NAME@$HOST" \
    bash -s -- \
    "$REMOTE_DIR" \
    "$APP_NAME" \
    "$PLATFORM" \
    "$version" \
    "$build" \
    "$EXPECTED_DB_HOST" \
    "$EXPECTED_DB_NAME" <<'REMOTE'
set -euo pipefail

REMOTE_DIR="$1"
APP_NAME="$2"
PLATFORM="$3"
VERSION="$4"
BUILD="$5"
EXPECTED_DB_HOST="$6"
EXPECTED_DB_NAME="$7"

cd "$REMOTE_DIR"

APP_NAME="$APP_NAME" \
PLATFORM="$PLATFORM" \
VERSION="$VERSION" \
BUILD="$BUILD" \
EXPECTED_DB_HOST="$EXPECTED_DB_HOST" \
EXPECTED_DB_NAME="$EXPECTED_DB_NAME" \
node <<'NODE'
const fs = require('fs');

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

function loadDotenv(path = '.env') {
  if (!fs.existsSync(path)) {
    throw new Error(`Missing production env: ${path}`);
  }

  for (const rawLine of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);

    if (!match || process.env[match[1]] !== undefined) {
      continue;
    }

    let value = match[2].trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[match[1]] = value;
  }
}

async function main() {
  loadDotenv();

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not configured on EC2.');
  }

  const expectedHost = process.env.EXPECTED_DB_HOST;
  const expectedDb = process.env.EXPECTED_DB_NAME;

  if (!databaseUrl.includes(expectedHost)) {
    throw new Error(
      `Safety check failed: DATABASE_URL does not point to ${expectedHost}`,
    );
  }

  if (!databaseUrl.includes(`/${expectedDb}`)) {
    throw new Error(
      `Safety check failed: DATABASE_URL does not point to DB ${expectedDb}`,
    );
  }

  const pool = new Pool({
    connectionString: databaseUrl,
  });

  const prisma = new PrismaClient({
    adapter: new PrismaPg(pool),
  });

  try {
    const existing = await prisma.appRelease.findFirst({
      where: {
        appName: process.env.APP_NAME,
        platform: process.env.PLATFORM,
        buildNumber: Number(process.env.BUILD),
      },
      select: {
        id: true,
      },
    });

    process.stdout.write(existing ? 'exists' : 'available');
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
REMOTE
}

# ----------------------------------------------------------------------
# Flutter build
# ----------------------------------------------------------------------

build_apk() {
  cd "$MOBILE_DIR"

  flutter pub get

  local build_args=(
    build
    apk
    --release
  )

  if [[ -f "$PROD_DEFINES" ]]; then
    echo "==> Using production Dart defines:"
    echo "    $PROD_DEFINES"

    build_args+=(
      --dart-define-from-file=dart_defines.prod.json
    )
  else
    echo "WARN: $PROD_DEFINES not found." >&2
    echo "Using REMBEH_API_URL=$API_URL" >&2

    build_args+=(
      --dart-define=REMBEH_API_URL="$API_URL"
    )
  fi

  if ! flutter "${build_args[@]}"; then
    echo "Initial Flutter build failed. Cleaning and retrying once..."

    flutter clean
    flutter pub get
    flutter "${build_args[@]}"
  fi

  if [[ ! -f "$APK_PATH" ]]; then
    echo "Flutter reported success but APK is missing:" >&2
    echo "$APK_PATH" >&2
    exit 1
  fi

  echo "APK built:"
  ls -lh "$APK_PATH"
}

# ----------------------------------------------------------------------
# Publish
# ----------------------------------------------------------------------

publish_release() {
  local version="$1"
  local build="$2"
  local min_build="${3:-$build}"

  local remote_apk="/tmp/rembeh-mobile-${version}-${build}.apk"

  # Safety check immediately before production mutation.
  verify_remote_production_environment

  echo "==> Syncing release registration script..."

  ec2_scp \
    "$ROOT/scripts/register-mobile-apk-on-ec2.sh" \
    "$USER_NAME@$HOST:/tmp/register-mobile-apk-on-ec2.sh" \
    >/dev/null

  ec2_ssh "$USER_NAME@$HOST" \
    bash -s -- "$REMOTE_DIR" <<'REMOTE'
set -euo pipefail

REMOTE_DIR="$1"

mkdir -p "$REMOTE_DIR/scripts"

install \
  -m 755 \
  /tmp/register-mobile-apk-on-ec2.sh \
  "$REMOTE_DIR/scripts/register-mobile-apk-on-ec2.sh"
REMOTE

  echo "==> Uploading APK to EC2..."

  ec2_scp \
    "$APK_PATH" \
    "$USER_NAME@$HOST:$remote_apk" \
    >/dev/null

  echo "==> Registering release and uploading to production S3..."

  local message_b64
  local changelog_b64

  message_b64="$(
    printf '%s' "$MESSAGE" |
      base64 |
      tr -d '\n'
  )"

  changelog_b64="$(
    printf '%s' "$CHANGELOG_CSV" |
      base64 |
      tr -d '\n'
  )"

  local force_value="false"

  if [[ "$FORCE_UPDATE" == "true" ]]; then
    force_value="true"
  fi

  ec2_ssh \
    "$USER_NAME@$HOST" \
    bash -s -- \
    "$REMOTE_DIR" \
    "$remote_apk" \
    "$version" \
    "$build" \
    "$message_b64" \
    "$changelog_b64" \
    "$min_build" \
    "$force_value" \
    "$EXPECTED_DB_HOST" \
    "$EXPECTED_DB_NAME" \
    "$EXPECTED_S3_BUCKET" \
    "$EXPECTED_S3_REGION" <<'REMOTE'
set -euo pipefail

REMOTE_DIR="$1"
REMOTE_APK="$2"
VERSION="$3"
BUILD="$4"
MESSAGE_B64="$5"
CHANGELOG_B64="$6"
MIN_BUILD="$7"
FORCE_UPDATE="$8"
EXPECTED_DB_HOST="$9"
EXPECTED_DB_NAME="${10}"
EXPECTED_S3_BUCKET="${11}"
EXPECTED_S3_REGION="${12}"

cd "$REMOTE_DIR"

if [[ ! -f .env ]]; then
  echo "ERROR: Missing $REMOTE_DIR/.env" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

# Final safety barrier before DB/S3 mutation.

if [[ "${DATABASE_URL:-}" != *"$EXPECTED_DB_HOST"* ]]; then
  echo "ERROR: Wrong DATABASE_URL. Aborting release." >&2
  exit 1
fi

if [[ "${DATABASE_URL:-}" != *"/$EXPECTED_DB_NAME"* ]]; then
  echo "ERROR: Wrong production database name. Aborting." >&2
  exit 1
fi

if [[ "${S3_BUCKET:-}" != "$EXPECTED_S3_BUCKET" ]]; then
  echo "ERROR: Wrong S3_BUCKET. Aborting." >&2
  exit 1
fi

if [[ "${S3_REGION:-}" != "$EXPECTED_S3_REGION" ]]; then
  echo "ERROR: Wrong S3_REGION. Aborting." >&2
  exit 1
fi

MESSAGE="$(
  printf '%s' "$MESSAGE_B64" |
    base64 --decode
)"

CHANGELOG="$(
  printf '%s' "$CHANGELOG_B64" |
    base64 --decode
)"

register_args=(
  --apk "$REMOTE_APK"
  --version "$VERSION"
  --build "$BUILD"
  --message "$MESSAGE"
  --changelog "$CHANGELOG"
  --min-build "$MIN_BUILD"
)

if [[ "$FORCE_UPDATE" == "true" ]]; then
  register_args+=(--force)
fi

./scripts/register-mobile-apk-on-ec2.sh \
  "${register_args[@]}"

rm -f "$REMOTE_APK"
REMOTE

  echo "==> Verifying production update endpoint..."

  local current_build

  if (( build > 1 )); then
    current_build=$((build - 1))
  else
    current_build=0
  fi

  curl -fsS \
    --max-time 20 \
    "$API_URL/app/check-update?appName=$APP_NAME&platform=$PLATFORM&currentBuild=$current_build" \
    >/dev/null

  echo
  echo "Release ready:"
  echo "  Version: ${version}+${build}"
  echo "  Forced:  ${FORCE_UPDATE}"
  echo "  API:     ${API_URL}"
}

# ----------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------

main() {
  # Fail early if EC2 itself is unreachable or points at wrong production infra.
  verify_remote_production_environment

  local major
  local minor
  local patch
  local build

  read -r major minor patch build <<<"$(read_current_version)"

  local version
  version="$(version_string "$major" "$minor" "$patch")"

  echo "==> Current mobile version: ${version}+${build}"

  local status
  status="$(remote_release_exists "$version" "$build")"

  while [[ "$status" == "exists" ]]; do
    if [[ "$INCREMENT_MODE" == "none" ]]; then
      echo "Build ${version}+${build} already exists."
      echo "Incrementing build number to avoid duplicate release."

      INCREMENT_MODE="build"
    else
      echo "Build ${version}+${build} already exists."
      echo "Incrementing version/build."
    fi

    read -r major minor patch build <<<"$(
      bump_version \
        "$major" \
        "$minor" \
        "$patch" \
        "$build"
    )"

    version="$(version_string "$major" "$minor" "$patch")"

    status="$(remote_release_exists "$version" "$build")"
  done

  if [[ "$DRY_RUN" == "true" ]]; then
    echo
    echo "Would publish:"
    echo "  Version: ${version}+${build}"
    echo "  Forced:  ${FORCE_UPDATE}"
    exit 0
  fi

  write_pubspec_version "$version" "$build"

  echo "==> Using mobile version: ${version}+${build}"

  if [[ "$SKIP_BUILD" == "true" ]]; then
    if [[ ! -f "$APK_PATH" ]]; then
      echo "--skip-build used but APK does not exist:" >&2
      echo "$APK_PATH" >&2
      exit 1
    fi
  else
    build_apk
  fi

  if [[ "$SKIP_REGISTER" == "true" ]]; then
    echo "Build finished; production registration skipped."
    exit 0
  fi

  publish_release \
    "$version" \
    "$build" \
    "${MIN_BUILD:-$build}"
}

main "$@"