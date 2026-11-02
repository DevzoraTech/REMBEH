#!/usr/bin/env bash
set -Eeuo pipefail
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root"
for cmd in flutter jq ssh scp python3; do command -v "$cmd" >/dev/null || { echo "Missing: $cmd" >&2; exit 1; }; done
pubspec=apps/mobile/pubspec.yaml
line=$(sed -nE 's/^version:[[:space:]]*([0-9]+\.[0-9]+\.[0-9]+\+[0-9]+).*/\1/p' "$pubspec" | head -1)
[[ -n "$line" ]] || { echo 'Missing pubspec version X.Y.Z+N' >&2; exit 1; }
version=${line%%+*}; build=${line##*+}; epoch=${RELEASE_EPOCH:-2}
# Default to next build; do not silently modify pubspec or reuse the same build.
build=$((build+1))
force=false
while (($#)); do case "$1" in
  --version) version=${2:?}; shift 2;;
  --build) build=${2:?}; shift 2;;
  --epoch) epoch=${2:?}; shift 2;;
  --force) force=true; shift;;
  *) echo "Unknown option: $1" >&2; exit 2;;
esac; done
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$build" =~ ^[1-9][0-9]*$ && "$epoch" =~ ^[1-9][0-9]*$ ]] || { echo 'Invalid release metadata' >&2; exit 2; }
echo '==> Check registered mobile releases on Contabo'
selected=$(bash "$root/scripts/next-mobile-version-on-contabo.sh" "$version" "$build")
read -r version build <<< "$selected"
echo "==> Build mobile $version+$build (release epoch $epoch)"
bash "$root/scripts/build-mobile-release-contabo.sh" --version "$version" --build "$build" --epoch "$epoch"
apk="$root/apps/mobile/build/app/outputs/flutter-apk/app-release.apk"
echo '==> Register inactive release on Contabo'
bash "$root/scripts/register-mobile-apk-on-contabo.sh" "$apk" "$version" "$build" "$epoch" "$force"
