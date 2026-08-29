#!/usr/bin/env bash
# Deploy REMBEH API to EC2 (GitHub → pull → build → systemd).
#
# Normal use from laptop:
#   ./scripts/deploy-api-ec2.sh
#
# Run directly on EC2:
#   ./scripts/deploy-api-ec2.sh on-server
#
# IMPORTANT:
# - Production secrets live ONLY in /home/ubuntu/rembeh/.env
# - This script NEVER uploads the laptop .env
# - GitHub contains source code only
# - EC2 IAM role supplies AWS S3 credentials
#
# Optional Firebase secret-file sync:
#   SYNC_FIREBASE_SECRETS=1 ./scripts/deploy-api-ec2.sh
#
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

SYNC_FIREBASE_SECRETS="${SYNC_FIREBASE_SECRETS:-0}"

EXPECTED_DB_HOST="${EXPECTED_DB_HOST:-rembeh-production-db.c9i86weakejt.af-south-1.rds.amazonaws.com}"
EXPECTED_DB_NAME="${EXPECTED_DB_NAME:-rembeh}"
EXPECTED_S3_BUCKET="${EXPECTED_S3_BUCKET:-rembeh-production-file-bk}"
EXPECTED_S3_REGION="${EXPECTED_S3_REGION:-af-south-1}"

deploy_api_on_server() {
  set -euo pipefail

  cd "$REMOTE_DIR"

  echo "==> Runtime check..."

  export DEBIAN_FRONTEND=noninteractive

  if ! command -v node >/dev/null 2>&1 || \
     [[ "$(node -v | sed 's/v//;s/\..*//')" -lt 22 ]]; then
    sudo apt-get update -y
    sudo apt-get install -y ca-certificates curl git build-essential

    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi

  if ! command -v git >/dev/null 2>&1; then
    sudo apt-get update -y
    sudo apt-get install -y git
  fi

  # Headless LibreOffice for loan-agreement DOCX → PDF.
  if ! command -v soffice >/dev/null 2>&1 && \
     ! command -v libreoffice >/dev/null 2>&1; then

    echo "==> Attempting LibreOffice install..."

    if sudo apt-get update -y && \
       sudo apt-get install -y libreoffice-writer-nogui; then
      echo "LibreOffice installed."
    else
      echo "WARN: LibreOffice install failed. PDF fallback will be used." >&2
      sudo dpkg --configure -a >/dev/null 2>&1 || true
      sudo apt-get -y -f install >/dev/null 2>&1 || true
    fi
  fi

  # Swap
  if ! swapon --show | grep -q .; then
    echo "==> Creating 2 GB swap..."

    sudo fallocate -l 2G /swapfile 2>/dev/null || \
      sudo dd if=/dev/zero of=/swapfile bs=1M count=2048

    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile

    if ! grep -q '^/swapfile ' /etc/fstab; then
      echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
    fi
  fi

  # ------------------------------------------------------------------
  # Production environment
  # ------------------------------------------------------------------

  ENV_FILE="$REMOTE_DIR/.env"

  if [[ ! -f "$ENV_FILE" ]]; then
    echo "ERROR: Missing production env file: $ENV_FILE" >&2
    echo "Create it manually on EC2. Deployment will not create/upload it." >&2
    exit 1
  fi

  chmod 600 "$ENV_FILE"

  # RDS CA
  if [[ ! -f "$REMOTE_DIR/global-bundle.pem" ]]; then
    echo "==> Downloading AWS RDS CA bundle..."

    curl -fsSL \
      -o "$REMOTE_DIR/global-bundle.pem" \
      https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
  fi

  # Load production env.
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a

  # ------------------------------------------------------------------
  # SAFETY CHECKS
  # ------------------------------------------------------------------

  echo "==> Verifying production infrastructure targets..."

  if [[ "${DATABASE_URL:-}" != *"$EXPECTED_DB_HOST"* ]]; then
    echo "ERROR: DATABASE_URL does not point to production RDS." >&2
    echo "Expected host: $EXPECTED_DB_HOST" >&2
    exit 1
  fi

  if [[ "${DATABASE_URL:-}" != *"/$EXPECTED_DB_NAME"* ]]; then
    echo "ERROR: DATABASE_URL does not appear to use DB '$EXPECTED_DB_NAME'." >&2
    exit 1
  fi

  if [[ "${S3_BUCKET:-}" != "$EXPECTED_S3_BUCKET" ]]; then
    echo "ERROR: Wrong S3_BUCKET." >&2
    echo "Expected: $EXPECTED_S3_BUCKET" >&2
    echo "Actual:   ${S3_BUCKET:-<unset>}" >&2
    exit 1
  fi

  if [[ "${S3_REGION:-}" != "$EXPECTED_S3_REGION" ]]; then
    echo "ERROR: Wrong S3_REGION." >&2
    echo "Expected: $EXPECTED_S3_REGION" >&2
    echo "Actual:   ${S3_REGION:-<unset>}" >&2
    exit 1
  fi

  if [[ -n "${S3_ACCESS_KEY:-}" || -n "${S3_SECRET_KEY:-}" ]]; then
    echo "ERROR: S3 static credentials are set." >&2
    echo "Production EC2 must use its IAM role instead." >&2
    exit 1
  fi

  echo "Production targets verified:"
  echo "  DB host : $EXPECTED_DB_HOST"
  echo "  DB name : $EXPECTED_DB_NAME"
  echo "  S3      : $EXPECTED_S3_BUCKET"
  echo "  Region  : $EXPECTED_S3_REGION"

  # The API-level env copy is only for tooling that searches services/api/.env.
  # It is generated FROM the authoritative server env, never from laptop.
  cp "$ENV_FILE" "$REMOTE_DIR/services/api/.env"
  chmod 600 "$REMOTE_DIR/services/api/.env"

  # ------------------------------------------------------------------
  # Install / migrate / build
  # ------------------------------------------------------------------

  echo "==> Install dependencies..."

  export NODE_OPTIONS='--max-old-space-size=768'

  # NODE_ENV must not suppress build dependencies during npm install.
  NODE_ENV=development npm install

  echo "==> Prisma production DB check..."

  npm --workspace services/api exec prisma validate

  echo "==> Applying committed Prisma migrations..."
  npm --workspace services/api exec prisma migrate deploy

  echo "==> Generating Prisma client..."
  npm --workspace services/api exec prisma generate

  echo "==> Building Nest API..."
  (
    cd services/api
    ../../node_modules/.bin/nest build
  )

  API_DIR="$REMOTE_DIR/services/api"

  if [[ -f "$API_DIR/dist/src/main.js" ]]; then
    EXEC="$API_DIR/dist/src/main.js"
  elif [[ -f "$API_DIR/dist/main.js" ]]; then
    EXEC="$API_DIR/dist/main.js"
  else
    echo "ERROR: Build output main.js not found." >&2
    exit 1
  fi

  # ------------------------------------------------------------------
  # systemd
  # ------------------------------------------------------------------

  echo "==> Installing systemd service..."

  sudo tee /etc/systemd/system/rembeh-api.service >/dev/null <<UNIT
[Unit]
Description=REMBEH API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=${REMOTE_DIR}/services/api

EnvironmentFile=${REMOTE_DIR}/.env

Environment=NODE_ENV=production
Environment=PORT=4000
Environment=HOST=0.0.0.0

ExecStart=/usr/bin/node ${EXEC}

Restart=always
RestartSec=5

NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
UNIT

  sudo systemctl daemon-reload
  sudo systemctl enable rembeh-api
  sudo systemctl restart rembeh-api

  echo "==> Waiting for API..."

  API_READY=0

  for attempt in {1..20}; do
    if curl -fsS \
      --max-time 5 \
      http://127.0.0.1:4000/api/v1/platform/health \
      >/tmp/rembeh-health.json 2>/dev/null; then

      API_READY=1
      break
    fi

    sleep 2
  done

  if [[ "$API_READY" != "1" ]]; then
    echo "ERROR: API failed health check." >&2

    sudo systemctl --no-pager --full status rembeh-api || true
    sudo journalctl \
      -u rembeh-api \
      -n 100 \
      --no-pager || true

    exit 1
  fi

  echo "API health:"
  cat /tmp/rembeh-health.json
  echo

  sudo systemctl --no-pager --full status rembeh-api | head -25

  # ------------------------------------------------------------------
  # Nginx
  # ------------------------------------------------------------------

  if [[ -f "$REMOTE_DIR/scripts/ensure-nginx-web.sh" ]]; then
    echo "==> Ensuring nginx vhosts..."

    bash "$REMOTE_DIR/scripts/ensure-nginx-web.sh"
  else
    echo "WARN: scripts/ensure-nginx-web.sh missing — nginx untouched." >&2
  fi

  echo
  echo "REMBEH API deployment complete."
  echo "Production API: https://rembeh-api.antikra.com/api/v1"
}

# ----------------------------------------------------------------------
# Run directly on EC2
# ----------------------------------------------------------------------

if [[ "${1:-}" == "on-server" ]]; then
  REMOTE_DIR="${EC2_REMOTE_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
  deploy_api_on_server
  exit 0
fi

# ----------------------------------------------------------------------
# Laptop / CI entry
# ----------------------------------------------------------------------

trap ec2_ssh_cleanup EXIT
ec2_resolve_key

echo "==> [1/4] Verify remote repository..."

ec2_ssh "$USER_NAME@$HOST" bash -s <<REMOTE
set -euo pipefail

REMOTE_DIR='$REMOTE_DIR'

if [[ ! -d "\$REMOTE_DIR/.git" ]]; then
  echo "ERROR: \$REMOTE_DIR is not a Git repository." >&2
  exit 1
fi

cd "\$REMOTE_DIR"
git remote -v | head -2
REMOTE

echo "==> [2/4] Pull $REPO_URL ($BRANCH)..."

ec2_remote_pull

echo "==> [3/4] Production .env remains on EC2 — NOT uploading laptop .env."

# ----------------------------------------------------------------------
# Optional Firebase service-account sync
# ----------------------------------------------------------------------

if [[ "$SYNC_FIREBASE_SECRETS" == "1" ]]; then
  echo "==> Syncing Firebase service-account files..."

  WEB_SA_SRC="$(
    ls \
      "$ROOT"/secrets/rembeh-web-firebase-adminsdk.json \
      "$ROOT"/apps/web/rembeh-web-firebase-adminsdk*.json \
      2>/dev/null | head -1 || true
  )"

  MOBILE_SA_SRC="$(
    ls \
      "$ROOT"/secrets/rembeh-mobile-firebase-adminsdk.json \
      "$ROOT"/apps/mobile/rembeh-mobile-firebase-adminsdk*.json \
      2>/dev/null | head -1 || true
  )"

  ec2_ssh "$USER_NAME@$HOST" \
    "mkdir -p '$REMOTE_DIR/secrets' && chmod 700 '$REMOTE_DIR/secrets'"

  if [[ -n "$WEB_SA_SRC" && -f "$WEB_SA_SRC" ]]; then
    ec2_scp \
      "$WEB_SA_SRC" \
      "$USER_NAME@$HOST:$REMOTE_DIR/secrets/rembeh-web-firebase-adminsdk.json"

    ec2_ssh "$USER_NAME@$HOST" \
      "chmod 600 '$REMOTE_DIR/secrets/rembeh-web-firebase-adminsdk.json'"

    echo "Synced web Firebase service account."
  fi

  if [[ -n "$MOBILE_SA_SRC" && -f "$MOBILE_SA_SRC" ]]; then
    ec2_scp \
      "$MOBILE_SA_SRC" \
      "$USER_NAME@$HOST:$REMOTE_DIR/secrets/rembeh-mobile-firebase-adminsdk.json"

    ec2_ssh "$USER_NAME@$HOST" \
      "chmod 600 '$REMOTE_DIR/secrets/rembeh-mobile-firebase-adminsdk.json'"

    echo "Synced mobile Firebase service account."
  fi
else
  echo "Firebase secret files unchanged."
  echo "Use SYNC_FIREBASE_SECRETS=1 only when intentionally rotating them."
fi

echo "==> [4/4] Build + restart on EC2..."

ec2_ssh "$USER_NAME@$HOST" \
  "EC2_REMOTE_DIR='$REMOTE_DIR' bash '$REMOTE_DIR/scripts/deploy-api-ec2.sh' on-server"

echo
echo "Deployment complete."
echo "GitHub:    $REPO_URL ($BRANCH)"
echo "Public API: https://rembeh-api.antikra.com/api/v1"
echo "EC2 host:   $HOST"