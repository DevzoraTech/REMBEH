#!/usr/bin/env bash
# Upload a REMBEH Android APK to S3 (via API) and register the release.
#
# Usage:
#   REMBEH_ADMIN_TOKEN=<jwt> ./scripts/release-mobile-apk.sh \
#     --version 1.0.1 --build 2 \
#     --apk path/to/app-release.apk \
#     [--message "..."] [--changelog "a,b,c"] [--force]
#
# Env:
#   REMBEH_API_URL   default https://rembeh-api.antikra.com/api/v1
#   REMBEH_ADMIN_TOKEN  JWT with workspace.update
set -euo pipefail

API_URL="${REMBEH_API_URL:-https://rembeh-api.antikra.com/api/v1}"
TOKEN="${REMBEH_ADMIN_TOKEN:-}"
APP_NAME="mobile"
PLATFORM="android"
VERSION=""
BUILD=""
APK=""
MESSAGE=""
CHANGELOG_CSV=""
FORCE="false"
MIN_BUILD="1"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version|-v) VERSION="$2"; shift 2 ;;
    --build|-b) BUILD="$2"; shift 2 ;;
    --apk) APK="$2"; shift 2 ;;
    --message|-m) MESSAGE="$2"; shift 2 ;;
    --changelog|-c) CHANGELOG_CSV="$2"; shift 2 ;;
    --force) FORCE="true"; shift ;;
    --min-build) MIN_BUILD="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$TOKEN" ]]; then
  echo "Set REMBEH_ADMIN_TOKEN (JWT with workspace.update)" >&2
  exit 1
fi
if [[ -z "$VERSION" || -z "$BUILD" || -z "$APK" ]]; then
  echo "Required: --version, --build, --apk" >&2
  exit 1
fi
if [[ ! -f "$APK" ]]; then
  echo "APK not found: $APK" >&2
  exit 1
fi

echo "==> Requesting upload URL..."
UPLOAD_JSON=$(curl -fsS -X POST "$API_URL/app/upload-url" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"appName\":\"$APP_NAME\",\"platform\":\"$PLATFORM\",\"version\":\"$VERSION\",\"buildNumber\":$BUILD}")

UPLOAD_URL=$(echo "$UPLOAD_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['uploadUrl'])")
S3_KEY=$(echo "$UPLOAD_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['s3Key'])")

echo "==> Uploading to S3 key: $S3_KEY"
curl -fsS -X PUT "$UPLOAD_URL" \
  -H "Content-Type: application/vnd.android.package-archive" \
  --data-binary @"$APK" >/dev/null

HASH=$(shasum -a 256 "$APK" | awk '{print $1}')

# Build changelog JSON array
if [[ -n "$CHANGELOG_CSV" ]]; then
  CHANGELOG_JSON=$(python3 -c "import json,sys; print(json.dumps([x.strip() for x in sys.argv[1].split(',') if x.strip()]))" "$CHANGELOG_CSV")
else
  CHANGELOG_JSON='[]'
fi

MSG_JSON=$(python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "${MESSAGE:-}")

echo "==> Registering release..."
curl -fsS -X POST "$API_URL/app/releases" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"appName\": \"$APP_NAME\",
    \"platform\": \"$PLATFORM\",
    \"version\": \"$VERSION\",
    \"buildNumber\": $BUILD,
    \"updateMode\": \"full\",
    \"forceUpdate\": $FORCE,
    \"minSupportedBuild\": $MIN_BUILD,
    \"apkUrl\": \"$S3_KEY\",
    \"apkHash\": \"$HASH\",
    \"changelog\": $CHANGELOG_JSON,
    \"message\": $MSG_JSON
  }"

echo
echo "OK — download via:"
echo "  $API_URL/app/download/mobile?platform=android"
echo "  $API_URL/app/download/android"
