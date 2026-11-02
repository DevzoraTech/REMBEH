#!/usr/bin/env bash
set -Eeuo pipefail
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
apk=${1:?Usage: register-mobile-apk-on-contabo.sh APK VERSION BUILD EPOCH [true|false]}
version=${2:?}; build=${3:?}; epoch=${4:?}; force=${5:-false}
[[ -s "$apk" ]] || { echo 'APK missing' >&2; exit 1; }
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$build" =~ ^[1-9][0-9]*$ && "$epoch" =~ ^[1-9][0-9]*$ && "$force" =~ ^(true|false)$ ]] || { echo 'Invalid release metadata' >&2; exit 1; }
sdk=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}
aapt=$(command -v aapt || true)
if [[ -z "$aapt" && -d "$sdk/build-tools" ]]; then
  aapt=$(find "$sdk/build-tools" -name aapt -type f 2>/dev/null | sort | tail -1 || true)
fi
[[ -n "$aapt" ]] || { echo 'Android aapt is required to verify APK version metadata.' >&2; exit 1; }
metadata=$("$aapt" dump badging "$apk")
package_line=$(printf '%s\n' "$metadata" | sed -n '/^package: /{p;q;}')
[[ "$package_line" == *"versionCode='$build'"* && "$package_line" == *"versionName='$version'"* ]] || {
  echo "APK version does not match $version+$build. Rebuild with ./scripts/deploy-mobile.sh; a signed APK cannot be renumbered during registration." >&2; exit 1;
}
for cmd in ssh scp shasum; do command -v "$cmd" >/dev/null || exit 1; done
hash=$(shasum -a 256 "$apk" | awk '{print $1}')
host=${CONTABO_HOST:-84.247.184.219}; user=${CONTABO_USER:-antikra}; key=${CONTABO_KEY:-$HOME/.ssh/antikra_production}
remote="$user@$host"
ssh_opts=(-i "$key" -o StrictHostKeyChecking=yes)
# Remote directory owned by the SSH user; do not accept arbitrary paths.
remote_dir="/tmp/antikra-mobile-$(date -u +%Y%m%dT%H%M%S)-$$"
echo '==> Create isolated transfer directory on Contabo'
ssh "${ssh_opts[@]}" "$remote" "umask 077; mkdir '$remote_dir'"
cleanup(){ ssh "${ssh_opts[@]}" "$remote" "rm -rf '$remote_dir'" >/dev/null 2>&1 || true; }
trap cleanup EXIT
echo '==> Transfer APK and reviewed registration helper'
scp "${ssh_opts[@]}" "$apk" "$remote:$remote_dir/app.apk"
scp "${ssh_opts[@]}" "$root/scripts/contabo-mobile-register.cjs" "$remote:$remote_dir/register.cjs"
echo '==> Verify checksum, copy to API container, register INACTIVE release'
# sudo prompts through SSH tty. Only fixed docker operations are used.
ssh -tt "${ssh_opts[@]}" "$remote" "set -e; echo '$hash  $remote_dir/app.apk' | sha256sum -c -; sudo docker inspect rembeh-api --format '{{.State.Running}}' | grep -qx true; sudo docker cp '$remote_dir/app.apk' rembeh-api:/tmp/antikra-release.apk; sudo docker cp '$remote_dir/register.cjs' rembeh-api:/tmp/antikra-register.cjs; sudo docker exec -e NODE_PATH=/app/node_modules rembeh-api node /tmp/antikra-register.cjs /tmp/antikra-release.apk '$version' '$build' '$epoch' '$hash' '$force'"
echo '==> Release registered inactive; activate from Control Center'
