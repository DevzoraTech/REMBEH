#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
mobile="$root/apps/mobile"
version=''
build=''
epoch=2
publish=0
force=0
apk="$mobile/build/app/outputs/flutter-apk/app-release.apk"
usage() {
  echo 'Usage: build-mobile-release-contabo.sh --version X.Y.Z --build N [--epoch N] [--publish] [--force]' >&2
  echo 'Publishing requires REMBEH_ADMIN_TOKEN and creates an inactive release for review.' >&2
}
while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) version=${2:-}; shift 2 ;;
    --build) build=${2:-}; shift 2 ;;
    --epoch) epoch=${2:-}; shift 2 ;;
    --publish) publish=1; shift ;;
    --force) force=1; shift ;;
    *) usage; exit 2 ;;
  esac
done
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$build" =~ ^[1-9][0-9]*$ && "$epoch" =~ ^[1-9][0-9]*$ ]] || { usage; exit 2; }
[[ $publish -eq 0 || -n ${REMBEH_ADMIN_TOKEN:-} ]] || { echo 'Set REMBEH_ADMIN_TOKEN before publishing.' >&2; exit 1; }
command -v flutter >/dev/null || { echo 'Flutter is required.' >&2; exit 1; }
cd "$mobile"
flutter pub get
args=(build apk --release "--build-name=$version" "--build-number=$build")
if [[ -f dart_defines.prod.json ]]; then
  [[ $(jq -r '.REMBEH_API_URL' dart_defines.prod.json) == 'https://rembeh-api.antikra.com/api/v1' ]] || {
    echo 'Production API URL does not match the live service.' >&2; exit 1;
  }
  args+=(--dart-define-from-file=dart_defines.prod.json)
else
  args+=(--dart-define=REMBEH_API_URL=https://rembeh-api.antikra.com/api/v1)
fi
flutter "${args[@]}"
[[ -s "$apk" ]] || { echo 'Built APK is missing.' >&2; exit 1; }
signer=$(command -v apksigner || true)
if [[ -z "$signer" ]]; then
  sdk=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}
  signer=$(find "$sdk/build-tools" -name apksigner -type f 2>/dev/null | sort | tail -1 || true)
fi
[[ -n "$signer" ]] || { echo 'Android apksigner is required to verify the release.' >&2; exit 1; }
"$signer" verify "$apk" || { echo 'APK signature verification failed.' >&2; exit 1; }
for abi in arm64-v8a armeabi-v7a; do
  for library in libflutter.so libapp.so; do
    unzip -Z1 "$apk" | grep -Fx "lib/$abi/$library" >/dev/null || { echo "Missing $abi/$library" >&2; exit 1; }
  done
done
printf 'Built %s+%s; SHA-256: ' "$version" "$build"
shasum -a 256 "$apk" | awk '{print $1}'
if [[ $publish -eq 1 ]]; then
  release_args=(--version "$version" --build "$build" --release-epoch "$epoch" --apk "$apk")
  [[ $force -eq 0 ]] || release_args+=(--force)
  bash "$root/scripts/release-mobile-apk.sh" "${release_args[@]}"
  echo 'The release is inactive. Review and activate it in Control Center.'
fi
