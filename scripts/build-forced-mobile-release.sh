#!/usr/bin/env bash
# Build a REMBEH Android APK, upload it through the production EC2 host, and
# register it as a forced full update.
#
# Usage:
#   ./scripts/build-forced-mobile-release.sh
#   ./scripts/build-forced-mobile-release.sh --message "A new REMBEH update is ready"
#   ./scripts/build-forced-mobile-release.sh --changelog "Works better offline,Syncs latest records faster"
#
# Defaults target the new production host:
#   EC2_HOST=15.240.28.47
#   EC2_USER=ubuntu
#   EC2_REMOTE_DIR=/home/ubuntu/rembeh
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PUBSPEC="$ROOT/apps/mobile/pubspec.yaml"
MOBILE_DIR="$ROOT/apps/mobile"
PROD_DEFINES="$MOBILE_DIR/dart_defines.prod.json"
APK_PATH="$MOBILE_DIR/build/app/outputs/flutter-apk/app-release.apk"

HOST="${EC2_HOST:-15.240.28.47}"
USER_NAME="${EC2_USER:-ubuntu}"
REMOTE_DIR="${EC2_REMOTE_DIR:-/home/ubuntu/rembeh}"
REPO_URL="${REPO_URL:-git@github.com:Tukivu-Systems/rembeh.git}"
BRANCH="${BRANCH:-main}"
API_URL="${REMBEH_API_URL:-https://rembeh-api.antikra.com/api/v1}"
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
Build and publish a forced REMBEH Android update.

Options:
  --message TEXT        Friendly update prompt shown to users.
  --changelog CSV      Friendly comma-separated "what's new" items.
  --increment MODE     patch, minor, major, build, or none. Default: patch.
  --min-build NUMBER   Minimum supported build. Default: new build number.
  --no-force           Register as an optional update.
  --skip-build         Reuse the existing APK at apps/mobile/build/.../app-release.apk.
  --no-register        Build only; do not upload/register.
  --dry-run            Print the chosen version/build without changing files.
  -h, --help           Show this help.

Environment:
  EC2_HOST, EC2_USER, EC2_REMOTE_DIR, EC2_KEY or EC2_SSH_KEY, REMBEH_API_URL.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --message|-m) MESSAGE="$2"; shift 2 ;;
    --changelog|-c) CHANGELOG_CSV="$2"; shift 2 ;;
    --increment) INCREMENT_MODE="$2"; shift 2 ;;
    --min-build) MIN_BUILD="$2"; shift 2 ;;
    --no-force) FORCE_UPDATE="false"; shift ;;
    --skip-build) SKIP_BUILD="true"; shift ;;
    --no-register) SKIP_REGISTER="true"; shift ;;
    --dry-run) DRY_RUN="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage >&2; exit 1 ;;
  esac
done

case "$INCREMENT_MODE" in
  patch|minor|major|build|none) ;;
  *) echo "--increment must be patch, minor, major, build, or none" >&2; exit 1 ;;
esac

if [[ ! -f "$PUBSPEC" ]]; then
  echo "Missing mobile pubspec: $PUBSPEC" >&2
  exit 1
fi

# shellcheck source=scripts/lib/ec2-ssh.sh
source "$ROOT/scripts/lib/ec2-ssh.sh"
trap ec2_ssh_cleanup EXIT
ec2_resolve_key

read_current_version() {
  local line
  line="$(sed -nE 's/^version:[[:space:]]*([0-9]+)\.([0-9]+)\.([0-9]+)\+([0-9]+).*/\1 \2 \3 \4/p' "$PUBSPEC" | head -1)"
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
    major) major=$((major + 1)); minor=0; patch=0; build=$((build + 1)) ;;
    minor) minor=$((minor + 1)); patch=0; build=$((build + 1)) ;;
    patch) patch=$((patch + 1)); build=$((build + 1)) ;;
    build) build=$((build + 1)) ;;
    none) build=$((build + 1)) ;;
  esac
  echo "$major $minor $patch $build"
}

remote_release_exists() {
  local version="$1"
  local build="$2"
  ec2_ssh "$USER_NAME@$HOST" bash -s -- "$REMOTE_DIR" "$APP_NAME" "$PLATFORM" "$version" "$build" <<'REMOTE'
set -euo pipefail
REMOTE_DIR="$1"
APP_NAME="$2"
PLATFORM="$3"
VERSION="$4"
BUILD="$5"
cd "$REMOTE_DIR"
APP_NAME="$APP_NAME" PLATFORM="$PLATFORM" VERSION="$VERSION" BUILD="$BUILD" node <<'NODE'
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

function loadDotenv(path = '.env') {
  if (!fs.existsSync(path)) return;
  for (const rawLine of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
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
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured on the EC2 host.');
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const existing = await prisma.appRelease.findFirst({
      where: {
        appName: process.env.APP_NAME,
        platform: process.env.PLATFORM,
        buildNumber: Number(process.env.BUILD),
      },
      select: { id: true },
    });
    process.stdout.write(existing ? 'exists' : 'available');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
NODE
REMOTE
}

write_pubspec_version() {
  local version="$1"
  local build="$2"
  perl -0pi -e "s/^version:\\s*[^\\n]+/version: ${version}+${build}/m" "$PUBSPEC"
}

build_apk() {
  cd "$MOBILE_DIR"
  flutter pub get
  local build_args=(build apk --release)
  if [[ -f "$PROD_DEFINES" ]]; then
    build_args+=(--dart-define-from-file=dart_defines.prod.json)
  else
    build_args+=(--dart-define=REMBEH_API_URL="$API_URL")
  fi

  if ! flutter "${build_args[@]}"; then
    echo "Initial Flutter build failed. Cleaning and retrying once..."
    flutter clean
    flutter pub get
    flutter "${build_args[@]}"
  fi

  if [[ ! -f "$APK_PATH" ]]; then
    echo "Flutter reported success, but APK was not found at $APK_PATH" >&2
    exit 1
  fi
}

publish_release() {
  local version="$1"
  local build="$2"
  local min_build="${3:-$build}"
  local remote_apk="/tmp/rembeh-mobile-${version}-${build}.apk"

  echo "==> Syncing register script to EC2..."

  ec2_scp \
    "$ROOT/scripts/register-mobile-apk-on-ec2.sh" \
    "$USER_NAME@$HOST:/tmp/register-mobile-apk-on-ec2.sh" \
    >/dev/null

  ec2_ssh "$USER_NAME@$HOST" bash -s -- "$REMOTE_DIR" <<'REMOTE'
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

  echo "==> Registering forced update and uploading to production S3..."

  #
  # SSH remote commands do not preserve ordinary shell argument boundaries
  # for values containing spaces.
  #
  # Encode user-facing text before transport so MESSAGE and CHANGELOG arrive
  # on EC2 as exactly one argument each.
  #
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
    "$force_value" <<'REMOTE'
set -euo pipefail

REMOTE_DIR="$1"
REMOTE_APK="$2"
VERSION="$3"
BUILD="$4"
MESSAGE_B64="$5"
CHANGELOG_B64="$6"
MIN_BUILD="$7"
FORCE_UPDATE="$8"

MESSAGE="$(
  printf '%s' "$MESSAGE_B64" |
    base64 --decode
)"

CHANGELOG="$(
  printf '%s' "$CHANGELOG_B64" |
    base64 --decode
)"

cd "$REMOTE_DIR"

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
REMOTE

  echo "==> Verifying update endpoint..."

    local current_build

  if (( build > 1 )); then
    current_build=$((build - 1))
  else
    current_build=0
  fi

  curl -fsS \
    "$API_URL/app/check-update?appName=$APP_NAME&platform=$PLATFORM&currentBuild=$current_build" \
    >/dev/null

  echo "Release ready: version ${version}+${build}"
}

main() {
  local major minor patch build
  read -r major minor patch build <<<"$(read_current_version)"
  local version
  version="$(version_string "$major" "$minor" "$patch")"

  echo "==> Current mobile version: ${version}+${build}"
  local status
  status="$(remote_release_exists "$version" "$build")"
  while [[ "$status" == "exists" ]]; do
    if [[ "$INCREMENT_MODE" == "none" ]]; then
      echo "Build ${version}+${build} already exists; incrementing build number to avoid a duplicate release."
      INCREMENT_MODE="build"
    else
      echo "Build ${version}+${build} already exists; incrementing version/build."
    fi
    read -r major minor patch build <<<"$(bump_version "$major" "$minor" "$patch" "$build")"
    version="$(version_string "$major" "$minor" "$patch")"
    status="$(remote_release_exists "$version" "$build")"
  done

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "Would publish version ${version}+${build} (force update: ${FORCE_UPDATE})"
    exit 0
  fi

  write_pubspec_version "$version" "$build"
  echo "==> Using mobile version: ${version}+${build}"

  if [[ "$SKIP_BUILD" == "true" ]]; then
    if [[ ! -f "$APK_PATH" ]]; then
      echo "--skip-build was used but no APK exists at $APK_PATH" >&2
      exit 1
    fi
  else
    build_apk
  fi

  if [[ "$SKIP_REGISTER" == "true" ]]; then
    echo "Build finished; registration skipped."
    exit 0
  fi

  publish_release "$version" "$build" "${MIN_BUILD:-$build}"
}

main "$@"
