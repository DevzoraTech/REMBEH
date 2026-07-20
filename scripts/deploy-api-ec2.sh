#!/usr/bin/env bash
# Deploy REMBEH API to EC2 (GitHub → pull → build → systemd).
#
# Modes:
#   ./scripts/deploy-api-ec2.sh              # from laptop: SSH + pull + optional .env sync + on-server
#   ./scripts/deploy-api-ec2.sh on-server    # run ON the EC2 host (used by CI after git pull)
#
# CI / GitHub Actions:
#   SKIP_ENV_UPLOAD=1 EC2_SSH_KEY="..." EC2_HOST=... EC2_USER=ubuntu ./scripts/deploy-api-ec2.sh
#   — or SSH in and: git pull && bash scripts/deploy-api-ec2.sh on-server
#
# Secrets (DATABASE_URL, etc.) stay on the server in /home/ubuntu/rembeh/.env — never in GitHub.
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
SKIP_ENV_UPLOAD="${SKIP_ENV_UPLOAD:-0}"

deploy_api_on_server() {
  set -euo pipefail
  cd "$REMOTE_DIR"

  echo "==> Runtime check (Node 22+, git, LibreOffice for loan-agreement PDF)..."
  export DEBIAN_FRONTEND=noninteractive
  if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v//;s/\..*//')" -lt 22 ]]; then
    sudo apt-get update -y
    sudo apt-get install -y ca-certificates curl git build-essential
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi
  if ! command -v git >/dev/null 2>&1; then
    sudo apt-get update -y && sudo apt-get install -y git
  fi
  # Headless Writer used to convert filled Loan-agreement DOCX → PDF.
  # Best-effort: disk-constrained hosts fall back to template-field PDF rendering.
  if ! command -v soffice >/dev/null 2>&1 && ! command -v libreoffice >/dev/null 2>&1; then
    echo "==> Attempting libreoffice-writer-nogui install (DOCX→PDF)..."
    if sudo apt-get update -y && sudo apt-get install -y libreoffice-writer-nogui; then
      echo "LibreOffice installed."
    else
      echo "WARN: LibreOffice install failed (disk/deps). Agreement PDF will use DOCX field fallback." >&2
      sudo dpkg --configure -a >/dev/null 2>&1 || true
      sudo apt-get -y -f install >/dev/null 2>&1 || true
    fi
  fi
  if ! swapon --show | grep -q .; then
    sudo fallocate -l 2G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
  fi

  if [[ ! -f "$REMOTE_DIR/.env" ]]; then
    echo "Missing $REMOTE_DIR/.env — create it once on the server (not via GitHub)." >&2
    exit 1
  fi

  if [[ ! -f "$REMOTE_DIR/global-bundle.pem" ]]; then
    curl -fsSL -o "$REMOTE_DIR/global-bundle.pem" \
      https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
  fi
  cp "$REMOTE_DIR/.env" "$REMOTE_DIR/services/api/.env"

  echo "==> Install, Prisma migrate, generate, build..."
  export NODE_OPTIONS='--max-old-space-size=768'
  # Do NOT source .env before npm install — NODE_ENV=production skips devDependencies.
  npm install
  set -a
  # shellcheck disable=SC1091
  . "$REMOTE_DIR/.env"
  set +a
  npm --workspace services/api exec prisma migrate deploy
  npm --workspace services/api exec prisma generate
  (cd services/api && ../../node_modules/.bin/nest build)
  test -f services/api/dist/src/main.js || test -f services/api/dist/main.js

  echo "==> systemd rembeh-api..."
  API_DIR="$REMOTE_DIR/services/api"
  if [[ -f "$API_DIR/dist/src/main.js" ]]; then
    EXEC="$API_DIR/dist/src/main.js"
  elif [[ -f "$API_DIR/dist/main.js" ]]; then
    EXEC="$API_DIR/dist/main.js"
  else
    echo "Build output main.js not found" >&2
    exit 1
  fi
  sudo tee /etc/systemd/system/rembeh-api.service >/dev/null <<UNIT
[Unit]
Description=REMBEH API (from GitHub)
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=${REMOTE_DIR}/services/api
Environment=NODE_ENV=production
Environment=PORT=4000
Environment=HOST=0.0.0.0
EnvironmentFile=${REMOTE_DIR}/.env
ExecStart=/usr/bin/node ${EXEC}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
  sudo systemctl daemon-reload
  sudo systemctl enable rembeh-api
  sudo systemctl restart rembeh-api
  sleep 3
  sudo systemctl --no-pager --full status rembeh-api | head -25
  curl -sS --max-time 25 http://127.0.0.1:4000/api/v1/platform/health || true
  echo

  # Never overwrite/remove rembeh-web SSL. Re-install committed vhosts so API
  # nginx stays scoped to rembeh-api.antikra.com only (no default_server on 443).
  if [[ -x "$REMOTE_DIR/scripts/ensure-nginx-web.sh" ]] || [[ -f "$REMOTE_DIR/scripts/ensure-nginx-web.sh" ]]; then
    echo "==> Ensuring nginx vhosts (web SSL preserved; API host-only)..."
    bash "$REMOTE_DIR/scripts/ensure-nginx-web.sh"
  else
    echo "WARN: scripts/ensure-nginx-web.sh missing — not touching nginx" >&2
  fi

  echo "API on-server deploy OK — https://rembeh-api.antikra.com/api/v1"
}

# --- on-server entry (CI / after git pull on EC2) ---
if [[ "${1:-}" == "on-server" ]]; then
  REMOTE_DIR="${EC2_REMOTE_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
  deploy_api_on_server
  exit 0
fi

# --- client entry (laptop or GitHub Actions runner) ---
trap ec2_ssh_cleanup EXIT
ec2_resolve_key

echo "==> [1/4] Ensure git remote can pull..."
ec2_ssh "$USER_NAME@$HOST" bash -s <<REMOTE
set -euo pipefail
REMOTE_DIR='$REMOTE_DIR'
if [[ -d "\$REMOTE_DIR/.git" ]]; then
  cd "\$REMOTE_DIR"
  git remote -v | head -2
fi
REMOTE

echo "==> [2/4] Pull $REPO_URL ($BRANCH)..."
ec2_remote_pull

if [[ "$SKIP_ENV_UPLOAD" != "1" ]]; then
  if [[ ! -f "$ROOT/.env" ]]; then
    echo "Missing $ROOT/.env (set SKIP_ENV_UPLOAD=1 to use server .env only)." >&2
    exit 1
  fi
  echo "==> [3/4] Sync .env to server (IAM role for S3; not stored in GitHub)..."
  python3 - <<PY | ec2_ssh "$USER_NAME@$HOST" "cat > '$REMOTE_DIR/.env'"
from pathlib import Path
import re
text = Path("$ROOT/.env").read_text()
text = re.sub(
    r"sslrootcert=[^&\"']+",
    "sslrootcert=/home/ubuntu/rembeh/global-bundle.pem",
    text,
)
lines = []
for line in text.splitlines():
    if line.startswith("S3_ENDPOINT="):
        lines.append("S3_ENDPOINT=")
    elif line.startswith("S3_PUBLIC_ENDPOINT="):
        lines.append("S3_PUBLIC_ENDPOINT=")
    elif line.startswith("S3_ACCESS_KEY="):
        lines.append("S3_ACCESS_KEY=")
    elif line.startswith("S3_SECRET_KEY="):
        lines.append("S3_SECRET_KEY=")
    elif line.startswith("HOST="):
        lines.append("HOST=0.0.0.0")
    elif line.startswith("PORT="):
        lines.append("PORT=4000")
    elif line.startswith("CORS_ORIGIN="):
        lines.append(
            "CORS_ORIGIN=http://rembeh.antikra.com,https://rembeh.antikra.com,http://13.63.130.241,https://13.63.130.241,http://localhost:3000,http://127.0.0.1:3000"
        )
    elif line.startswith("NODE_ENV="):
        lines.append("NODE_ENV=production")
    else:
        lines.append(line)
if not any(l.startswith("NODE_ENV=") for l in lines):
    lines.insert(0, "NODE_ENV=production")
print("\n".join(lines) + "\n")
PY
else
  echo "==> [3/4] SKIP_ENV_UPLOAD=1 — keeping server .env"
fi

echo "==> [4/4] Build + restart on server..."
ec2_ssh "$USER_NAME@$HOST" \
  "EC2_REMOTE_DIR='$REMOTE_DIR' bash '$REMOTE_DIR/scripts/deploy-api-ec2.sh' on-server"

echo
echo "Deployed from GitHub: $REPO_URL ($BRANCH)"
echo "Public API: https://rembeh-api.antikra.com/api/v1"
echo "SSH/deploy host: $HOST"
