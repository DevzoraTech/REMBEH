#!/usr/bin/env bash
# By default: keep mobile on the live production API.
# Pass --local to write dart-defines that point debug builds at your Mac LAN API.
#
#   ./tool/sync_dev_host.sh              # production defaults (no local override)
#   ./tool/sync_dev_host.sh --local      # detect LAN IP → dart_defines.dev.json
#   ./tool/sync_dev_host.sh --local 192.168.1.10
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
MOBILE="$ROOT/apps/mobile"
ENV_FILE="$ROOT/.env"
PROD_API="https://rembeh-api.antikra.com/api/v1"

USE_LOCAL=0
HOST=""

for arg in "$@"; do
  case "$arg" in
    --local)
      USE_LOCAL=1
      ;;
    *)
      HOST="$arg"
      ;;
  esac
done

# Always clear the legacy in-code LAN host — config.dart ignores it.
cat >"$MOBILE/lib/config_dev_host.dart" <<'EOF'
/// Legacy LAN host stub. Mobile defaults to the live API (see `config.dart`).
///
/// To point a debug build at a local API, pass:
/// `--dart-define=REMBEH_API_URL=http://<host>:4000/api/v1`
/// or run `./tool/sync_dev_host.sh --local` and use the generated dart-defines.
const String rembehDevApiHost = '';
EOF

if [[ "$USE_LOCAL" -eq 0 ]]; then
  cat >"$MOBILE/dart_defines.dev.json" <<EOF
{}
EOF
  echo "Wrote $MOBILE/dart_defines.dev.json (empty — app uses live API)"
  echo "Wrote $MOBILE/lib/config_dev_host.dart"
  echo "  default API → $PROD_API"
  echo
  echo "For a local API instead:"
  echo "  ./tool/sync_dev_host.sh --local"
  echo "  flutter run --dart-define-from-file=dart_defines.dev.json"
  exit 0
fi

if [[ -z "$HOST" ]]; then
  HOST="$(ipconfig getifaddr en0 2>/dev/null || true)"
fi
if [[ -z "$HOST" ]]; then
  HOST="$(ipconfig getifaddr en1 2>/dev/null || true)"
fi
if [[ -z "$HOST" ]]; then
  echo "Could not detect LAN IP. Pass it explicitly:" >&2
  echo "  ./tool/sync_dev_host.sh --local 192.168.x.x" >&2
  exit 1
fi

LOCAL_API="http://${HOST}:4000/api/v1"
S3_PUBLIC="http://${HOST}:9000"

cat >"$MOBILE/dart_defines.dev.json" <<EOF
{
  "REMBEH_API_URL": "${LOCAL_API}"
}
EOF

echo "Wrote $MOBILE/dart_defines.dev.json (local override)"
echo "Wrote $MOBILE/lib/config_dev_host.dart"
echo "  local API → ${LOCAL_API}"
echo "  run with: flutter run --dart-define-from-file=dart_defines.dev.json"

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
