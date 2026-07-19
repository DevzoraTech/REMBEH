#!/usr/bin/env bash
# Writes dart_defines.dev.json + lib/config_dev_host.dart (and patches root .env)
# so a physical device can reach the API + MinIO on this machine's LAN IP.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
MOBILE="$ROOT/apps/mobile"
ENV_FILE="$ROOT/.env"

HOST="${1:-}"
if [[ -z "$HOST" ]]; then
  HOST="$(ipconfig getifaddr en0 2>/dev/null || true)"
fi
if [[ -z "$HOST" ]]; then
  HOST="$(ipconfig getifaddr en1 2>/dev/null || true)"
fi
if [[ -z "$HOST" ]]; then
  echo "Could not detect LAN IP. Pass it explicitly:" >&2
  echo "  ./tool/sync_dev_host.sh 192.168.x.x" >&2
  exit 1
fi

API_URL="http://${HOST}:4000/api/v1"
S3_PUBLIC="http://${HOST}:9000"

cat >"$MOBILE/dart_defines.dev.json" <<EOF
{
  "REMBEH_API_URL": "${API_URL}"
}
EOF

cat >"$MOBILE/lib/config_dev_host.dart" <<EOF
/// Generated/updated by \`tool/sync_dev_host.sh\`.
/// Used as the default API host so physical devices reach your Mac on LAN.
const String rembehDevApiHost = '${HOST}';
EOF

echo "Wrote $MOBILE/dart_defines.dev.json"
echo "Wrote $MOBILE/lib/config_dev_host.dart"
echo "  REMBEH_API_URL=${API_URL}"

if [[ -f "$ENV_FILE" ]]; then
  if grep -q '^S3_PUBLIC_ENDPOINT=' "$ENV_FILE"; then
    sed -i.bak "s|^S3_PUBLIC_ENDPOINT=.*|S3_PUBLIC_ENDPOINT=${S3_PUBLIC}|" "$ENV_FILE"
    rm -f "${ENV_FILE}.bak"
  else
    printf '\nS3_PUBLIC_ENDPOINT=%s\n' "$S3_PUBLIC" >>"$ENV_FILE"
  fi
  if grep -q '^HOST=' "$ENV_FILE"; then
    sed -i.bak "s|^HOST=.*|HOST=0.0.0.0|" "$ENV_FILE"
    rm -f "${ENV_FILE}.bak"
  else
    printf '\nHOST=0.0.0.0\n' >>"$ENV_FILE"
  fi
  echo "Updated $ENV_FILE S3_PUBLIC_ENDPOINT=${S3_PUBLIC}"
  echo "Restart the API after .env changes if MinIO public URL changed."
fi

echo
echo "Cold-start the app (hot reload will NOT pick up host changes):"
echo "  cd apps/mobile && flutter run --dart-define-from-file=dart_defines.dev.json"
