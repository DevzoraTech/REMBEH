#!/usr/bin/env bash
# Install committed nginx vhosts for rembeh web + API + marketing site and reload nginx.
#
# Usage (on EC2, from repo root or any cwd):
#   bash scripts/ensure-nginx-web.sh
#
# Safe to call from deploy-web-ec2.sh, deploy-api-ec2.sh, and deploy-website-ec2.sh.
# Never removes rembeh-web SSL; never lets API claim rembeh.antikra.com.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_SRC="$ROOT/deploy/nginx/rembeh-web.conf"
API_SRC="$ROOT/deploy/nginx/rembeh-api.conf"
GET_SRC_HTTP="$ROOT/deploy/nginx/rembeh-get.conf"
GET_SRC_SSL="$ROOT/deploy/nginx/rembeh-get-ssl.conf"
WEB_DST="/etc/nginx/sites-available/rembeh-web"
API_DST="/etc/nginx/sites-available/rembeh-api"
GET_DST="/etc/nginx/sites-available/rembeh-get"
WEB_DOMAIN="${WEB_DOMAIN:-rembeh.antikra.com}"
API_DOMAIN="${API_DOMAIN:-rembeh-api.antikra.com}"
GET_DOMAIN="${GET_DOMAIN:-get.rembeh.antikra.com}"

if [[ ! -f "$WEB_SRC" ]]; then
  echo "Missing $WEB_SRC" >&2
  exit 1
fi
if [[ ! -f "$API_SRC" ]]; then
  echo "Missing $API_SRC" >&2
  exit 1
fi
if [[ ! -f "$GET_SRC_HTTP" ]]; then
  echo "Missing $GET_SRC_HTTP" >&2
  exit 1
fi

# /etc/letsencrypt/live is root-only — must use sudo to probe certs
if ! sudo test -f "/etc/letsencrypt/live/${WEB_DOMAIN}/fullchain.pem"; then
  echo "Missing Let's Encrypt cert for ${WEB_DOMAIN} at /etc/letsencrypt/live/${WEB_DOMAIN}/" >&2
  echo "Issue once: sudo certbot certonly --nginx -d ${WEB_DOMAIN}" >&2
  exit 1
fi
if ! sudo test -f "/etc/letsencrypt/live/${API_DOMAIN}/fullchain.pem"; then
  echo "Missing Let's Encrypt cert for ${API_DOMAIN} at /etc/letsencrypt/live/${API_DOMAIN}/" >&2
  exit 1
fi

ERRORS_SRC="$ROOT/deploy/nginx/errors"
ERRORS_DST="/var/www/rembeh-errors"

echo "==> Installing branded nginx error pages..."
if [[ ! -d "$ERRORS_SRC" ]]; then
  echo "Missing $ERRORS_SRC" >&2
  exit 1
fi
sudo mkdir -p "$ERRORS_DST"
sudo cp -f "$ERRORS_SRC"/*.html "$ERRORS_DST"/
sudo chmod 644 "$ERRORS_DST"/*.html

echo "==> Installing nginx site configs from deploy/nginx/..."
sudo cp "$WEB_SRC" "$WEB_DST"
sudo cp "$API_SRC" "$API_DST"

# Marketing site: HTTPS if cert exists, else HTTP-only (DNS may not be ready yet)
if sudo test -f "/etc/letsencrypt/live/${GET_DOMAIN}/fullchain.pem" && [[ -f "$GET_SRC_SSL" ]]; then
  echo "==> ${GET_DOMAIN}: installing HTTPS vhost"
  sudo cp "$GET_SRC_SSL" "$GET_DST"
else
  echo "==> ${GET_DOMAIN}: installing HTTP-only vhost (run certbot after Spaceship DNS A → EC2)"
  sudo cp "$GET_SRC_HTTP" "$GET_DST"
fi

sudo ln -sfn "$WEB_DST" /etc/nginx/sites-enabled/rembeh-web
sudo ln -sfn "$API_DST" /etc/nginx/sites-enabled/rembeh-api
sudo ln -sfn "$GET_DST" /etc/nginx/sites-enabled/rembeh-get
sudo rm -f /etc/nginx/sites-enabled/default

# Ensure static root exists (populated by deploy-website-ec2.sh)
sudo mkdir -p /var/www/rembeh-get
if [[ ! -f /var/www/rembeh-get/index.html ]]; then
  echo "<!doctype html><html><body><p>REMBEH marketing site pending deploy.</p></body></html>" | sudo tee /var/www/rembeh-get/index.html >/dev/null
fi

# Guardrails: API must not catch the web hostname; web must have SSL listen
# (ignore comments — only match real nginx directives)
if ! grep -vE '^[[:space:]]*#' "$WEB_DST" | grep -qE "server_name[[:space:]].*${WEB_DOMAIN}"; then
  echo "rembeh-web.conf missing server_name ${WEB_DOMAIN}" >&2
  exit 1
fi
if ! grep -vE '^[[:space:]]*#' "$WEB_DST" | grep -qE 'listen[[:space:]]+443'; then
  echo "rembeh-web.conf must listen on 443 ssl" >&2
  exit 1
fi
if grep -vE '^[[:space:]]*#' "$API_DST" | grep -qE "server_name[[:space:]].*${WEB_DOMAIN}([[:space:]]|;|\$)"; then
  echo "FATAL: rembeh-api.conf must not include server_name ${WEB_DOMAIN}" >&2
  exit 1
fi
if grep -vE '^[[:space:]]*#' "$API_DST" | grep -qE 'default_server'; then
  echo "FATAL: rembeh-api.conf must not use default_server (steals unmatched Host on shared IP)" >&2
  exit 1
fi
if ! grep -vE '^[[:space:]]*#' "$GET_DST" | grep -qE "server_name[[:space:]].*${GET_DOMAIN}"; then
  echo "rembeh-get.conf missing server_name ${GET_DOMAIN}" >&2
  exit 1
fi
# Marketing must never claim the app or API hostnames
if grep -vE '^[[:space:]]*#' "$GET_DST" | grep -qE "server_name[[:space:]].*${WEB_DOMAIN}([[:space:]]|;|\$)"; then
  echo "FATAL: rembeh-get must not include server_name ${WEB_DOMAIN}" >&2
  exit 1
fi
if grep -vE '^[[:space:]]*#' "$GET_DST" | grep -qE "server_name[[:space:]].*${API_DOMAIN}([[:space:]]|;|\$)"; then
  echo "FATAL: rembeh-get must not include server_name ${API_DOMAIN}" >&2
  exit 1
fi

sudo nginx -t
sudo systemctl reload nginx
echo "nginx web+api+get vhosts OK (web → :3000, api → :4000, get → /var/www/rembeh-get, errors → ${ERRORS_DST})."
