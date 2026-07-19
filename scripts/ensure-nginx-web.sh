#!/usr/bin/env bash
# Install committed nginx vhosts for rembeh web + API and reload nginx.
#
# Usage (on EC2, from repo root or any cwd):
#   bash scripts/ensure-nginx-web.sh
#
# Safe to call from both deploy-web-ec2.sh and deploy-api-ec2.sh.
# Never removes rembeh-web SSL; never lets API claim rembeh.antikra.com.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_SRC="$ROOT/deploy/nginx/rembeh-web.conf"
API_SRC="$ROOT/deploy/nginx/rembeh-api.conf"
WEB_DST="/etc/nginx/sites-available/rembeh-web"
API_DST="/etc/nginx/sites-available/rembeh-api"
WEB_DOMAIN="${WEB_DOMAIN:-rembeh.antikra.com}"
API_DOMAIN="${API_DOMAIN:-rembeh-api.antikra.com}"

if [[ ! -f "$WEB_SRC" ]]; then
  echo "Missing $WEB_SRC" >&2
  exit 1
fi
if [[ ! -f "$API_SRC" ]]; then
  echo "Missing $API_SRC" >&2
  exit 1
fi

if [[ ! -f "/etc/letsencrypt/live/${WEB_DOMAIN}/fullchain.pem" ]]; then
  echo "Missing Let's Encrypt cert for ${WEB_DOMAIN} at /etc/letsencrypt/live/${WEB_DOMAIN}/" >&2
  echo "Issue once: sudo certbot certonly --nginx -d ${WEB_DOMAIN}" >&2
  exit 1
fi
if [[ ! -f "/etc/letsencrypt/live/${API_DOMAIN}/fullchain.pem" ]]; then
  echo "Missing Let's Encrypt cert for ${API_DOMAIN} at /etc/letsencrypt/live/${API_DOMAIN}/" >&2
  exit 1
fi

echo "==> Installing nginx site configs from deploy/nginx/..."
sudo cp "$WEB_SRC" "$WEB_DST"
sudo cp "$API_SRC" "$API_DST"
sudo ln -sfn "$WEB_DST" /etc/nginx/sites-enabled/rembeh-web
sudo ln -sfn "$API_DST" /etc/nginx/sites-enabled/rembeh-api
sudo rm -f /etc/nginx/sites-enabled/default

# Guardrails: API must not catch the web hostname; web must have SSL listen
if ! grep -q "server_name ${WEB_DOMAIN}" "$WEB_DST"; then
  echo "rembeh-web.conf missing server_name ${WEB_DOMAIN}" >&2
  exit 1
fi
if ! grep -qE 'listen[[:space:]]+443' "$WEB_DST"; then
  echo "rembeh-web.conf must listen on 443 ssl" >&2
  exit 1
fi
if grep -qE "server_name[[:space:]].*${WEB_DOMAIN}" "$API_DST"; then
  echo "FATAL: rembeh-api.conf must not include server_name ${WEB_DOMAIN}" >&2
  exit 1
fi
if grep -qE 'default_server' "$API_DST"; then
  echo "FATAL: rembeh-api.conf must not use default_server (steals unmatched Host on shared IP)" >&2
  exit 1
fi

sudo nginx -t
sudo systemctl reload nginx
echo "nginx web+api vhosts OK (web → :3000, api → :4000)."
