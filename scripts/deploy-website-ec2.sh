#!/usr/bin/env bash
# Deploy REMBEH marketing website (Next static export) to EC2.
#
# Modes:
#   ./scripts/deploy-website-ec2.sh              # from laptop/CI: SSH + pull + on-server
#   ./scripts/deploy-website-ec2.sh on-server    # run ON the EC2 host
#
# Public URL:
#   http://get.rembeh.antikra.com/   (HTTPS after Spaceship DNS A + certbot)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/ec2-ssh.sh
source "$SCRIPT_DIR/lib/ec2-ssh.sh"

ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOST="${EC2_HOST:-13.63.130.241}"
USER_NAME="${EC2_USER:-ubuntu}"
REMOTE_DIR="${EC2_REMOTE_DIR:-/home/ubuntu/rembeh}"
REPO_URL="${REPO_URL:-https://github.com/DevzoraTech/REMBEH.git}"
BRANCH="${DEPLOY_BRANCH:-main}"
GET_DOMAIN="${GET_DOMAIN:-get.rembeh.antikra.com}"
WWW_ROOT="${WWW_ROOT:-/var/www/rembeh-get}"
SKIP_PULL="${SKIP_PULL:-0}"

smoke_check_get() {
  local url="http://${GET_DOMAIN}/"
  echo "==> Smoke: $url"
  local code
  code="$(curl -fsS -o /tmp/rembeh-get-smoke.body -w "%{http_code}" --max-time 20 -H "Host: ${GET_DOMAIN}" "http://127.0.0.1/" || true)"
  if [[ "$code" != "200" ]]; then
    # Fall back to Host-based request via public IP
    code="$(curl -fsS -o /tmp/rembeh-get-smoke.body -w "%{http_code}" --max-time 20 -H "Host: ${GET_DOMAIN}" "http://${HOST}/" || true)"
  fi
  body="$(head -c 400 /tmp/rembeh-get-smoke.body 2>/dev/null || true)"
  rm -f /tmp/rembeh-get-smoke.body
  if [[ "$code" != "200" ]]; then
    echo "WARN: expected HTTP 200 from ${GET_DOMAIN}, got ${code:-curl-failed}" >&2
    echo "      Add Spaceship DNS A: ${GET_DOMAIN} → ${HOST}" >&2
    return 0
  fi
  if ! echo "$body" | grep -qiE 'REMBEH|<!DOCTYPE html'; then
    echo "WARN: body does not look like REMBEH marketing HTML" >&2
    return 0
  fi
  echo "smoke_get=200 OK"
}

deploy_website_on_server() {
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

  echo "==> npm install (website)..."
  cd "$REMOTE_DIR/website"
  npm install

  echo "==> Next.js static export..."
  npm run build
  test -d out
  test -f out/index.html

  echo "==> Publish to ${WWW_ROOT}..."
  sudo mkdir -p "$WWW_ROOT"
  sudo rsync -a --delete out/ "$WWW_ROOT/"
  sudo chown -R www-data:www-data "$WWW_ROOT" 2>/dev/null || sudo chown -R ubuntu:ubuntu "$WWW_ROOT"

  echo "==> nginx vhosts (including get.rembeh)..."
  bash "$REMOTE_DIR/scripts/ensure-nginx-web.sh"

  smoke_check_get

  echo
  echo "Marketing site on-server deploy OK"
  echo "  HTTP:  http://${GET_DOMAIN}/"
  echo "  Files: ${WWW_ROOT}"
  echo "  DNS:   Spaceship A record ${GET_DOMAIN} → ${HOST}"
  echo "  TLS:   sudo certbot --nginx -d ${GET_DOMAIN}   # after DNS propagates"
}

# --- on-server entry ---
if [[ "${1:-}" == "on-server" ]]; then
  REMOTE_DIR="${EC2_REMOTE_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
  GET_DOMAIN="${GET_DOMAIN:-get.rembeh.antikra.com}"
  WWW_ROOT="${WWW_ROOT:-/var/www/rembeh-get}"
  HOST="${EC2_HOST:-13.63.130.241}"
  deploy_website_on_server
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

echo "==> [2/2] Build + publish marketing site on server..."
ec2_ssh "$USER_NAME@$HOST" \
  "EC2_REMOTE_DIR='$REMOTE_DIR' GET_DOMAIN='$GET_DOMAIN' WWW_ROOT='$WWW_ROOT' EC2_HOST='$HOST' \
   bash '$REMOTE_DIR/scripts/deploy-website-ec2.sh' on-server"

echo
echo "Public marketing: http://$GET_DOMAIN/ (HTTPS after DNS + certbot)"
