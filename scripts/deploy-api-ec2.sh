#!/usr/bin/env bash
# Deploy REMBEH API to EC2 by pulling from GitHub (secrets via scp .env only).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${EC2_HOST:-16.170.166.117}"
USER_NAME="${EC2_USER:-ubuntu}"
KEY="${EC2_KEY:-$ROOT/services/rembeh-key-pair.pem}"
REMOTE_DIR="${EC2_REMOTE_DIR:-/home/ubuntu/rembeh}"
REPO_URL="${REPO_URL:-https://github.com/DevzoraTech/REMBEH.git}"
BRANCH="${DEPLOY_BRANCH:-main}"

SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new)
SCP=(scp -i "$KEY" -o StrictHostKeyChecking=accept-new)

if [[ ! -f "$KEY" ]]; then
  echo "Missing key: $KEY" >&2
  exit 1
fi
chmod 400 "$KEY" 2>/dev/null || true

if [[ ! -f "$ROOT/.env" ]]; then
  echo "Missing $ROOT/.env (DATABASE_URL / secrets are not in GitHub)." >&2
  exit 1
fi

echo "==> [1/5] Runtime on EC2 (Node 22, git, build tools)..."
"${SSH[@]}" "$USER_NAME@$HOST" bash -s <<'REMOTE'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl git build-essential
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v//;s/\..*//')" -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
# Swap for small instances
if ! swapon --show | grep -q .; then
  sudo fallocate -l 2G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
fi
node -v && npm -v && git --version
REMOTE

echo "==> [2/5] Clone / pull $REPO_URL ($BRANCH)..."
"${SSH[@]}" "$USER_NAME@$HOST" bash -s <<REMOTE
set -euo pipefail
REPO_URL='$REPO_URL'
BRANCH='$BRANCH'
REMOTE_DIR='$REMOTE_DIR'
if [[ -d "\$REMOTE_DIR/.git" ]]; then
  cd "\$REMOTE_DIR"
  git fetch origin
  git checkout "\$BRANCH"
  git reset --hard "origin/\$BRANCH"
  # Keep node_modules / dist / .env between deploys
  git clean -fd -e node_modules -e dist -e .env -e services/api/.env -e global-bundle.pem
else
  rm -rf "\$REMOTE_DIR"
  git clone --branch "\$BRANCH" "\$REPO_URL" "\$REMOTE_DIR"
fi
cd "\$REMOTE_DIR"
git rev-parse --short HEAD
git log -1 --oneline
REMOTE

echo "==> [3/5] Upload .env + RDS CA (not stored in GitHub)..."
python3 - <<PY | "${SSH[@]}" "$USER_NAME@$HOST" "cat > '$REMOTE_DIR/.env'"
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
    # Production EC2: AWS S3 via instance IAM role (no static keys).
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
        lines.append("CORS_ORIGIN=*")
    elif line.startswith("NODE_ENV="):
        lines.append("NODE_ENV=production")
    else:
        lines.append(line)
if not any(l.startswith("NODE_ENV=") for l in lines):
    lines.insert(0, "NODE_ENV=production")
print("\n".join(lines) + "\n")
PY

"${SSH[@]}" "$USER_NAME@$HOST" bash -s <<REMOTE
set -euo pipefail
cd '$REMOTE_DIR'
curl -fsSL -o global-bundle.pem \
  https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
cp .env services/api/.env
REMOTE

echo "==> [4/5] Install, Prisma generate, build..."
"${SSH[@]}" "$USER_NAME@$HOST" bash -s <<REMOTE
set -euo pipefail
cd '$REMOTE_DIR'
export NODE_OPTIONS='--max-old-space-size=768'
# Do NOT source .env before npm install — NODE_ENV=production skips devDependencies (nest/prisma CLI).
npm install
set -a
# shellcheck disable=SC1091
. '$REMOTE_DIR/.env'
set +a
npm --workspace services/api exec prisma generate
(cd services/api && ../../node_modules/.bin/nest build)
test -f services/api/dist/src/main.js || test -f services/api/dist/main.js
REMOTE

echo "==> [5/5] systemd service..."
"${SSH[@]}" "$USER_NAME@$HOST" bash -s <<'REMOTE'
set -euo pipefail
API_DIR=/home/ubuntu/rembeh/services/api
if [[ -f "$API_DIR/dist/src/main.js" ]]; then
  EXEC=/home/ubuntu/rembeh/services/api/dist/src/main.js
elif [[ -f "$API_DIR/dist/main.js" ]]; then
  EXEC=/home/ubuntu/rembeh/services/api/dist/main.js
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
WorkingDirectory=/home/ubuntu/rembeh/services/api
Environment=NODE_ENV=production
Environment=PORT=4000
Environment=HOST=0.0.0.0
EnvironmentFile=/home/ubuntu/rembeh/.env
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
REMOTE

echo
echo "Deployed from GitHub: $REPO_URL ($BRANCH)"
echo "Public API: https://rembeh-api.antikra.com/api/v1"
echo "SSH/deploy host: $HOST (local listen :4000; nginx terminates HTTPS)."
