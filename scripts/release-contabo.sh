#!/usr/bin/env bash
# One-command Mac release orchestrator. Production changes require confirmation.
set -Eeuo pipefail
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
component=${1:-}; [[ $# -gt 0 ]] && shift || true
case "$component" in api|web|mobile) ;; *) echo 'Usage: ./scripts/release-contabo.sh api|web|mobile [--version X.Y.Z --build N] [--dry-run]' >&2; exit 2;; esac
mkdir -p "$root/.release-logs"
log="$root/.release-logs/${component}-$(date -u +%Y%m%dT%H%M%SZ).log"
exec > >(tee -a "$log") 2>&1
stage=initialization
fail(){ rc=$?; echo "FAILED at stage: $stage (exit $rc). Log: $log" >&2; echo 'Production changes may be partial; inspect running services before retrying. No automatic rollback or schema changes.' >&2; exit "$rc"; }
trap fail ERR
say(){ stage=$1; printf '\n==> %s\n' "$stage"; }
if [[ "$component" == mobile ]]; then
  say 'Mobile release preflight'
  command -v flutter >/dev/null; command -v jq >/dev/null
  [[ -n ${REMBEH_ADMIN_TOKEN:-} ]] || { echo 'REMBEH_ADMIN_TOKEN is required to register an inactive release.' >&2; exit 1; }
  version=''; build=''; extra=()
  while (($#)); do
    case "$1" in
      --version|--build|--epoch) [[ $# -ge 2 ]] || exit 2; extra+=("$1" "$2"); [[ "$1" == --version ]] && version=$2; [[ "$1" == --build ]] && build=$2; shift 2;;
      --force) extra+=("$1"); shift;;
      *) echo "Unsupported mobile option: $1" >&2; exit 2;;
    esac
  done
  # Read Flutter version+build from pubspec if not explicitly supplied.
  pubspec="$root/apps/mobile/pubspec.yaml"
  [[ -f "$pubspec" ]] || { echo "Missing $pubspec" >&2; exit 1; }
  line=$(sed -nE 's/^version:[[:space:]]*([0-9]+\.[0-9]+\.[0-9]+\+[0-9]+).*/\1/p' "$pubspec" | head -1)
  [[ -n "$line" ]] || { echo 'pubspec.yaml must contain version: X.Y.Z+N, or provide --version and --build.' >&2; exit 1; }
  if [[ -z "$version" ]]; then extra+=(--version "${line%%+*}"); fi
  if [[ -z "$build" ]]; then extra+=(--build "${line##*+}"); fi
  say 'Build signed Android release, verify APK, upload and register inactive release'
  bash "$root/scripts/build-mobile-release-contabo.sh" "${extra[@]}" --publish
  say 'Completed: release registered inactive; activate for selected users in Control Center'
  echo "Log: $log"
  exit 0
fi
[[ $# -eq 0 ]] || { echo 'API/web release takes no arguments. Use release-contabo.sh api or web.' >&2; exit 2; }
[[ ${ANTIKRA_CONFIRM_PRODUCTION:-} == YES ]] || { echo 'Production release requires ANTIKRA_CONFIRM_PRODUCTION=YES. No deployment attempted.' >&2; exit 1; }
for tool in docker git ssh scp jq curl; do command -v "$tool" >/dev/null || { echo "Missing $tool" >&2; exit 1; }; done
[[ -f "$root/scripts/deploy-contabo-service.sh" ]] || { echo 'Missing Mac deployment helper' >&2; exit 1; }
say 'Verify clean source tree'
[[ -z $(git -C "$root" status --porcelain) ]] || { echo 'Uncommitted changes found; commit/review before production release.' >&2; exit 1; }
say 'Check current production release'
status=$(bash "$root/scripts/deploy-contabo-service.sh" "$component" --status)
printf '%s\n' "$status"
expected=$(printf '%s\n' "$status" | sed -nE "s/^${component} current image tag: ([A-Za-z0-9._-]+)$/\1/p" | head -1)
[[ -n "$expected" ]] || { echo 'Could not parse current image tag; refusing production release.' >&2; exit 1; }
release="$(git -C "$root" rev-parse --short=12 HEAD)-${component}-$(date -u +%Y%m%dT%H%M%SZ)"
say "Build and transfer immutable $component image ($release); run remote preflight"
bash "$root/scripts/deploy-contabo-service.sh" "$component" --check --release "$release"
say "Deploy only $component, compare-and-swap expected=$expected"
bash "$root/scripts/deploy-contabo-service.sh" "$component" --apply --release "$release" --expected "$expected"
say 'Verify public endpoint after deployment'
if [[ "$component" == api ]]; then
  curl --fail --silent --show-error --max-time 20 https://rembeh-api.antikra.com/api/v1/platform/health | jq -e '.status == "ok" and .database == "up"' >/dev/null
else
  curl --fail --silent --show-error --max-time 20 -o /dev/null https://rembeh.antikra.com/
fi
say "SUCCESS: $component $expected -> $release"
echo "Log: $log"
