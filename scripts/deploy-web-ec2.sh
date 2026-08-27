#!/usr/bin/env bash
# Deploy REMBEH Next.js web app to EC2 (git pull → build → nginx + systemd).
#
# Modes:
#   ./scripts/deploy-web-ec2.sh              # from laptop/CI: SSH + pull + on-server
#   ./scripts/deploy-web-ec2.sh on-server    # run ON the EC2 host
#
# Public URLs:
#   https://rembeh.antikra.com/
#   http://15.240.28.47/  (HTTP only; domain redirects to HTTPS)
# API: NEXT_PUBLIC_API_URL=https://rembeh-api.antikra.com/api/v1
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/ec2-ssh.sh
source "$SCRIPT_DIR/lib/ec2-ssh.sh"

ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOST="${EC2_HOST:-15.240.28.47}"
USER_NAME="${EC2_USER:-ubuntu}"
REMOTE_DIR="${EC2_REMOTE_DIR:-/home/ubuntu/rembeh}"
REPO_URL="${REPO_URL:-https://github.com/DevzoraTech/REMBEH.git}"
BRANCH="${DEPLOY_BRANCH:-main}"
WEB_PORT="${WEB_PORT:-3000}"
API_URL="${NEXT_PUBLIC_API_URL:-https://rembeh-api.antikra.com/api/v1}"
WEB_DOMAIN="${WEB_DOMAIN:-rembeh.antikra.com}"
SKIP_PULL="${SKIP_PULL:-0}"

smoke_check_web() {
  local local_url="http://127.0.0.1:${WEB_PORT}/dashboard"
  echo "==> Smoke: $local_url"
  local local_code local_body
  local_code="$(curl -fsS -o /tmp/rembeh-web-smoke.body -w "%{http_code}" --max-time 25 "$local_url" || true)"
  local_body="$(head -c 400 /tmp/rembeh-web-smoke.body 2>/dev/null || true)"
  rm -f /tmp/rembeh-web-smoke.body
  if [[ "$local_code" != "200" ]]; then
    echo "FATAL: expected HTTP 200 from $local_url, got ${local_code:-curl-failed}" >&2
    exit 1
  fi
  if ! echo "$local_body" | grep -qiE 'next|<!DOCTYPE html'; then
    echo "FATAL: local web body does not look like Next.js HTML" >&2
    echo "$local_body" | head -c 200 >&2
    echo >&2
    exit 1
  fi
  echo "smoke_local_web=200 Next.js OK"

  local url="https://${WEB_DOMAIN}/dashboard"
  echo "==> Smoke: $url"
  local code body
  code="$(curl -fsS -o /tmp/rembeh-web-smoke.body -w "%{http_code}" --max-time 25 "$url" || true)"
  body="$(head -c 400 /tmp/rembeh-web-smoke.body 2>/dev/null || true)"
  rm -f /tmp/rembeh-web-smoke.body
  if [[ "$code" != "200" ]]; then
    echo "WARN: public HTTPS smoke for $url returned ${code:-curl-failed}." >&2
    echo "      Check inbound 80/443 and TLS certificates after DNS/network repair." >&2
    return 0
  fi
  if echo "$body" | grep -q 'Cannot GET'; then
    echo "FATAL: $url returned Nest 'Cannot GET' — nginx is proxying web Host to API :4000" >&2
    exit 1
  fi
  if ! echo "$body" | grep -qiE 'next|<!DOCTYPE html'; then
    echo "FATAL: $url body does not look like Next.js HTML" >&2
    echo "$body" | head -c 200 >&2
    echo >&2
    exit 1
  fi
  echo "smoke_web=200 Next.js OK"
}

deploy_web_on_server() {
  set -euo pipefail
  cd "$REMOTE_DIR"

  echo "==> Runtime check..."
  export DEBIAN_FRONTEND=noninteractive
  if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v//;s/\..*//')" -lt 22 ]]; then
    sudo apt-get update -y
    sudo apt-get install -y ca-certificates curl git build-essential nginx
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi
  if ! command -v nginx >/dev/null 2>&1; then
    sudo apt-get update -y && sudo apt-get install -y nginx
  fi

  export NODE_OPTIONS='--max-old-space-size=768'
  export NEXT_PUBLIC_API_URL="$API_URL"

  echo "==> npm install (web workspace)..."
  # Do NOT source .env before install — NODE_ENV=production skips devDependencies.
  npm install --workspace apps/web --include=dev

  # Bake public Firebase web config into the Next.js build when present on server.
  if [[ -f "$REMOTE_DIR/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    . "$REMOTE_DIR/.env"
    set +a
    export NEXT_PUBLIC_API_URL="$API_URL"
  fi

  echo "==> Next.js build..."
  cd apps/web
  rm -rf .next
  NEXT_PUBLIC_API_URL="$API_URL" npm run build
  test -d .next

  echo "==> systemd rembeh-web..."
  sudo tee /etc/systemd/system/rembeh-web.service >/dev/null <<UNIT
[Unit]
Description=REMBEH Web (Next.js)
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=${REMOTE_DIR}/apps/web
Environment=NODE_ENV=production
Environment=PORT=${WEB_PORT}
Environment=HOSTNAME=127.0.0.1
Environment=NEXT_PUBLIC_API_URL=${API_URL}
ExecStart=/usr/bin/npm run start -- --port ${WEB_PORT} --hostname 127.0.0.1
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

  echo "==> nginx vhosts (committed deploy/nginx/*.conf)..."
  bash "$REMOTE_DIR/scripts/ensure-nginx-web.sh"

  sudo systemctl daemon-reload
  sudo systemctl enable rembeh-web nginx
  sudo systemctl restart rembeh-web
  sleep 3
  curl -sS --max-time 20 -o /dev/null -w "local_web=%{http_code}\n" "http://127.0.0.1:${WEB_PORT}/" || true

  smoke_check_web

  echo
  echo "Web on-server deploy OK — https://${WEB_DOMAIN}/"
}

# --- on-server entry ---
if [[ "${1:-}" == "on-server" ]]; then
  REMOTE_DIR="${EC2_REMOTE_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
  API_URL="${NEXT_PUBLIC_API_URL:-https://rembeh-api.antikra.com/api/v1}"
  WEB_PORT="${WEB_PORT:-3000}"
  WEB_DOMAIN="${WEB_DOMAIN:-rembeh.antikra.com}"
  deploy_web_on_server
  exit 0
fi

# --- client entry ---
trap ec2_ssh_cleanup EXIT
ec2_resolve_key

if [[ "$SKIP_PULL" != "1" ]]; then
  echo "==> [1/2] Pull $REPO_URL ($BRANCH)..."
  ec2_remote_pull
else
  echo "==> [1/2] SKIP_PULL=1 — using existing tree on server"
fi

echo "==> [2/2] Build + nginx/systemd on server..."
ec2_ssh "$USER_NAME@$HOST" \
  "EC2_REMOTE_DIR='$REMOTE_DIR' NEXT_PUBLIC_API_URL='$API_URL' WEB_PORT='$WEB_PORT' WEB_DOMAIN='$WEB_DOMAIN' \
   bash '$REMOTE_DIR/scripts/deploy-web-ec2.sh' on-server"

echo
echo "Public web: https://$WEB_DOMAIN/"
echo "API: $API_URL"
