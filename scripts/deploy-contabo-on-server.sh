#!/usr/bin/env bash
set -euo pipefail

[[ ${EUID:-$(id -u)} -eq 0 ]] || { echo 'Run this reviewed helper with sudo.' >&2; exit 1; }
mode=${1:-}
release=${2:-}
expected=${3:-unused}
case "$mode" in --check|--apply) ;; *) echo 'Invalid mode.' >&2; exit 2 ;; esac
[[ "$release" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$ && "$release" != latest ]] || { echo 'Invalid release.' >&2; exit 2; }
[[ "$expected" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$ ]] || { echo 'Invalid expected release.' >&2; exit 2; }
cd /srv/antikra/services/rembeh
exec 9>/run/lock/antikra-rembeh-deploy.lock
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }
current=$(awk -F= '$1 == "RELEASE_ID" {print $2}' .env)
[[ -n "$current" ]] || { echo 'Current release is not recorded.' >&2; exit 1; }
for app in api web; do
  docker image inspect "antikra/rembeh-$app:$release" >/dev/null || {
    echo "Missing reviewed $app image for $release." >&2; exit 1;
  }
done
env RELEASE_ID="$release" docker compose -f compose.production-candidate.yaml config --quiet
systemctl start antikra-postgres-health.service
printf 'Current release: %s\nCandidate release: %s\n' "$current" "$release"
[[ "$mode" == --apply ]] || exit 0
[[ "$current" == "$expected" ]] || { echo 'Current release changed; recheck before deploying.' >&2; exit 1; }
echo 'Deploying reviewed images without database migrations.'
if ! env RELEASE_ID="$release" docker compose -f compose.production-candidate.yaml up -d --wait --wait-timeout 90 api web; then
  echo 'Deployment failed. Running containers may have changed; inspect them before rollback.' >&2
  exit 1
fi
if ! curl --fail --silent --show-error --max-time 20 https://rembeh-api.antikra.com/api/v1/platform/health | jq -e '.status == "ok" and .database == "up"' >/dev/null || \
   ! curl --fail --silent --show-error --max-time 20 -o /dev/null https://rembeh.antikra.com/; then
  echo 'Public verification failed. Inspect the deployment; do not blindly roll back database changes.' >&2
  exit 1
fi
tmp=$(mktemp .env.release.XXXXXX)
printf 'RELEASE_ID=%s\n' "$release" > "$tmp"
chmod --reference=.env "$tmp"
chown --reference=.env "$tmp"
mv "$tmp" .env
printf 'Release %s is running and passed basic health checks. Previous: %s\n' "$release" "$current"
