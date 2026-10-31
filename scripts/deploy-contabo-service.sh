#!/usr/bin/env bash
set -euo pipefail
# Run on Mac from anywhere inside the REMBEH repository.
usage(){ echo 'Usage: deploy-contabo-service.sh api|web --check|--apply|--status [--release TAG] [--expected TAG]' >&2; exit 2; }
[[ $# -ge 2 ]] || usage
service=$1; mode=$2; shift 2
[[ "$service" == api || "$service" == web ]] || usage
[[ "$mode" == --check || "$mode" == --apply || "$mode" == --status ]] || usage
release=''; expected=''
while (($#)); do case "$1" in --release) release=${2:-}; shift 2;; --expected) expected=${2:-}; shift 2;; *) usage;; esac; done
valid(){ [[ "$1" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$ && "$1" != latest ]]; }
[[ -z "$release" ]] || valid "$release" || usage
[[ -z "$expected" ]] || valid "$expected" || usage
if [[ "$mode" == --apply ]]; then [[ -n "$release" && -n "$expected" ]] || usage; fi
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo=$(cd "$script_dir/.." && pwd)
host=${CONTABO_HOST:-84.247.184.219}; user=${CONTABO_USER:-antikra}; key=${CONTABO_KEY:-$HOME/.ssh/antikra_production}
ssh_opts=(-i "$key" -o BatchMode=yes -o StrictHostKeyChecking=yes)
remote=("$user@$host")
helper=/srv/antikra/services/rembeh/ops/deploy-contabo-service-on-server.sh
if [[ "$mode" == --status ]]; then exec ssh -t "${ssh_opts[@]}" "${remote[@]}" sudo "$helper" --status "$service"; fi
if [[ "$mode" == --check ]]; then
  for cmd in docker scp ssh git; do command -v "$cmd" >/dev/null || { echo "Missing: $cmd" >&2; exit 1; }; done
  [[ -f "$repo/package-lock.json" && -f "$repo/deploy/contabo/Dockerfile.$service" ]] || { echo 'Run from the REMBEH repository with package-lock.json and deploy/contabo Dockerfiles.' >&2; exit 1; }
  [[ -n "$release" ]] || { short=$(git -C "$repo" rev-parse --short=12 HEAD); release="${short}-${service}-$(date -u +%Y%m%dT%H%M%SZ)"; }
  valid "$release" || usage
  if [[ "$service" == api ]]; then
    # The API release-storage fix must be incorporated in the current source before deploying.
    [[ -f "$repo/services/api/src/modules/app-update/release-storage.service.ts" ]] || { echo 'Cannot find release-storage service; inspect current source/hotfix before deploying.' >&2; exit 1; }
    args=()
  else
    args=(--build-arg NEXT_PUBLIC_API_URL=https://rembeh-api.antikra.com/api/v1)
  fi
  echo "Building $service linux/amd64 image antikra/rembeh-$service:$release"
  docker buildx build --platform linux/amd64 --load -f "$repo/deploy/contabo/Dockerfile.$service" "${args[@]}" -t "antikra/rembeh-$service:$release" "$repo"
  work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
  archive="$work/rembeh-$service.tar.gz"
  docker save "antikra/rembeh-$service:$release" | gzip -1 > "$archive"
  sha=$(shasum -a 256 "$archive" | awk '{print $1}')
  remote_file="/tmp/antikra-rembeh-$service-$release.tar.gz"
  scp "${ssh_opts[@]}" "$archive" "${remote[0]}:$remote_file"
  echo 'Loading reviewed image on VPS (sudo may require interactive authentication)...'
  ssh -t "${ssh_opts[@]}" "${remote[@]}" sudo "$helper" --load "$service" "$release" "$remote_file" "$sha"
  ssh -t "${ssh_opts[@]}" "${remote[@]}" sudo "$helper" --check "$service" "$release"
  echo "Candidate ready. To deploy: ./scripts/deploy-contabo-service.sh $service --apply --release $release --expected CURRENT_TAG"
  echo 'Get CURRENT_TAG from: ./scripts/deploy-contabo-service.sh api --status (or web --status)'
else
  echo "Production change requested: $service $expected -> $release"
  [[ ${ANTIKRA_CONFIRM_PRODUCTION:-} == YES ]] || { echo 'Set ANTIKRA_CONFIRM_PRODUCTION=YES to authorize a production change.' >&2; exit 1; }
  exec ssh -t "${ssh_opts[@]}" "${remote[@]}" sudo "$helper" --apply "$service" "$release" "$expected"
fi
