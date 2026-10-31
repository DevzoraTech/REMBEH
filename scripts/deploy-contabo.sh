#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo 'Usage: deploy-contabo.sh --check RELEASE | --apply RELEASE --expected CURRENT_RELEASE' >&2
  echo 'The reviewed server-side deployment helper must already be installed.' >&2
}
mode=${1:-}
release=${2:-}
expected=unused
case "$mode" in --check|--apply) ;; *) usage; exit 2 ;; esac
if [[ ! "$release" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$ || "$release" == latest ]]; then
  echo 'Provide a specific, valid release tag.' >&2; exit 2
fi
if [[ "$mode" == --apply ]]; then
  [[ ${3:-} == --expected && -n ${4:-} && $# == 4 ]] || { usage; exit 2; }
  expected=$4
  [[ "$expected" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$ ]] || { echo 'Invalid current release tag.' >&2; exit 2; }
else
  [[ $# == 2 ]] || { usage; exit 2; }
fi
host=${CONTABO_HOST:-84.247.184.219}
user=${CONTABO_USER:-antikra}
key=${CONTABO_KEY:-$HOME/.ssh/antikra_production}
exec ssh -t -o BatchMode=yes -o StrictHostKeyChecking=yes -i "$key" "$user@$host" \
  sudo /srv/antikra/services/rembeh/ops/deploy-contabo-on-server.sh "$mode" "$release" "$expected"
