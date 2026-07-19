#!/usr/bin/env bash
# Deploy REMBEH Next.js web app to EC2 (git pull → build → nginx + systemd).
#
# Modes:
#   ./scripts/deploy-web-ec2.sh              # from laptop/CI: SSH + pull + on-server
#   ./scripts/deploy-web-ec2.sh on-server    # run ON the EC2 host
#
# Public URLs (HTTP for now):
#   http://rembeh.antikra.com/
#   http://16.170.166.117/
# API (HTTPS): NEXT_PUBLIC_API_URL=https://rembeh-api.antikra.com/api/v1
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/ec2-ssh.sh
source "$SCRIPT_DIR/lib/ec2-ssh.sh"

ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOST="${EC2_HOST:-16.170.166.117}"
USER_NAME="${EC2_USER:-ubuntu}"
REMOTE_DIR="${EC2_REMOTE_DIR:-/home/ubuntu/rembeh}"
REPO_URL="${REPO_URL:-https://github.com/DevzoraTech/REMBEH.git}"
BRANCH="${DEPLOY_BRANCH:-main}"
WEB_PORT="${WEB_PORT:-3000}"
API_URL="${NEXT_PUBLIC_API_URL:-https://rembeh-api.antikra.com/api/v1}"
WEB_DOMAIN="${WEB_DOMAIN:-rembeh.antikra.com}"
SKIP_PULL="${SKIP_PULL:-0}"

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
  npm install --workspace apps/web

  echo "==> Next.js build..."
  cd apps/web
  rm -rf .next
  NEXT_PUBLIC_API_URL="$API_URL" npm run build
  test -d .next

  echo "==> systemd rembeh-web + nginx..."
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

  sudo tee /etc/nginx/sites-available/rembeh-web >/dev/null <<NGINX
# IP access + catch-all (default_server)
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:${WEB_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}

# Custom domain (HTTP for now — API keeps HTTPS via Let's Encrypt)
server {
    listen 80;
    listen [::]:80;
    server_name ${WEB_DOMAIN} www.${WEB_DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:${WEB_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX

  sudo ln -sfn /etc/nginx/sites-available/rembeh-web /etc/nginx/sites-enabled/rembeh-web
  sudo rm -f /etc/nginx/sites-enabled/default
  sudo nginx -t
  sudo systemctl daemon-reload
  sudo systemctl enable rembeh-web nginx
  sudo systemctl restart rembeh-web
  sudo systemctl reload nginx
  sleep 3
  curl -sS --max-time 20 -o /dev/null -w "local_web=%{http_code}\n" "http://127.0.0.1:${WEB_PORT}/" || true
  curl -sS --max-time 25 http://127.0.0.1:4000/api/v1/platform/health || true
  echo
  echo "Web on-server deploy OK — http://${WEB_DOMAIN}/ (HTTP); API remains HTTPS."
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
echo "Public web (IP): http://$HOST/"
echo "Public web (domain): http://$WEB_DOMAIN/  (DNS A → $HOST)"
echo "API: $API_URL"
echo "Note: web is HTTP; rembeh-api.antikra.com keeps HTTPS (Let's Encrypt)."
