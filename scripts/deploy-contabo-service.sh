#!/usr/bin/env bash
set -Eeuo pipefail
usage(){ echo 'Usage: deploy-contabo-service.sh api|web --check|--apply|--status [--release TAG] [--expected TAG]' >&2; exit 2; }
[[ $# -ge 2 ]] || usage
service=$1; mode=$2; shift 2
[[ "$service" == api || "$service" == web ]] || usage
[[ "$mode" == --check || "$mode" == --apply || "$mode" == --status ]] || usage
release=''; expected=''
while (($#)); do
  case "$1" in
    --release) [[ $# -ge 2 ]] || usage; release=$2; shift 2;;
    --expected) [[ $# -ge 2 ]] || usage; expected=$2; shift 2;;
    *) usage;;
  esac
done
valid(){ [[ "$1" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$ && "$1" != latest ]]; }
[[ -z "$release" ]] || valid "$release" || usage
[[ -z "$expected" ]] || valid "$expected" || usage
[[ "$mode" != --apply ]] || { [[ -n "$release" && -n "$expected" ]] || usage; }
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo=$(cd "$script_dir/.." && pwd)
host=${CONTABO_HOST:-84.247.184.219}; user=${CONTABO_USER:-antikra}; key=${CONTABO_KEY:-$HOME/.ssh/antikra_production}
[[ -f "$key" ]] || { echo "SSH key missing: $key" >&2; exit 1; }
ssh_opts=(-i "$key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=3)
remote="$user@$host"
helper=/srv/antikra/services/rembeh/ops/deploy-contabo-service-on-server.sh
# Remote sudo is interactive; prompts are displayed via SSH's forced TTY.
# Status is written to a local file, not captured through a command substitution.
remote_sudo(){ ssh -tt "${ssh_opts[@]}" "$remote" sudo "$helper" "$@"; }
case "$mode" in
  --status)
    echo '[Contabo] Checking current production image (sudo password may be requested)...' >&2
    remote_sudo --status "$service"
    ;;
  --check)
    for cmd in docker scp ssh git shasum gzip; do command -v "$cmd" >/dev/null || { echo "Missing: $cmd" >&2; exit 1; }; done
    [[ -f "$repo/package-lock.json" && -f "$repo/deploy/contabo/Dockerfile.$service" ]] || { echo 'Missing package-lock.json or Contabo Dockerfile.' >&2; exit 1; }
    [[ -n "$release" ]] || { short=$(git -C "$repo" rev-parse --short=12 HEAD); release="${short}-${service}-$(date -u +%Y%m%dT%H%M%SZ)"; }
    valid "$release" || usage
    if [[ "$service" == api ]]; then
      [[ -f "$repo/services/api/src/modules/app-update/release-storage.service.ts" ]] || { echo 'API release-storage service missing: check hotfix before deploying.' >&2; exit 1; }
      args=()
    else
      args=(--build-arg NEXT_PUBLIC_API_URL=https://rembeh-api.antikra.com/api/v1)
    fi
    echo "[Build] Building linux/amd64 image antikra/rembeh-$service:$release"
    docker buildx build --progress=plain --platform linux/amd64 --load -f "$repo/deploy/contabo/Dockerfile.$service" ${args[@]+"${args[@]}"} -t "antikra/rembeh-$service:$release" "$repo"
    work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
    archive="$work/rembeh-$service.tar.gz"
    echo '[Archive] Exporting and compressing image (this may take several minutes)...'
    docker save "antikra/rembeh-$service:$release" | gzip -1 > "$archive"
    sha=$(shasum -a 256 "$archive" | awk '{print $1}')
    du -h "$archive"
    remote_file="/tmp/antikra-rembeh-$service-$release.tar.gz"
    echo "[Transfer] Uploading archive to $remote:$remote_file"
    scp "${ssh_opts[@]}" "$archive" "$remote:$remote_file"
    echo '[Server] Loading candidate image (sudo password may be requested)...'
    remote_sudo --load "$service" "$release" "$remote_file" "$sha"
    echo '[Server] Checking candidate image...'
    remote_sudo --check "$service" "$release"
    echo "[Ready] Candidate $service:$release validated; not yet applied."
    ;;
  --apply)
    [[ ${ANTIKRA_CONFIRM_PRODUCTION:-} == YES ]] || { echo 'Set ANTIKRA_CONFIRM_PRODUCTION=YES to authorize production change.' >&2; exit 1; }
    echo "[Deploy] $service $expected -> $release (sudo password may be requested)..."
    remote_sudo --apply "$service" "$release" "$expected"
    ;;
esac
