# Shared SSH helpers for REMBEH EC2 deploy scripts.
# Sourced by deploy-*-ec2.sh (not executed directly).
# Caller must set: HOST, USER_NAME, REMOTE_DIR, REPO_URL, BRANCH, and ROOT (repo root).
# shellcheck shell=bash

# Resolve a private key path from EC2_KEY (file) or EC2_SSH_KEY (PEM contents).
# Sets KEY and optionally _EC2_KEY_TMP (cleaned by ec2_ssh_cleanup).
ec2_resolve_key() {
  _EC2_KEY_TMP=""
  if [[ -n "${EC2_SSH_KEY:-}" ]]; then
    _EC2_KEY_TMP="$(mktemp)"
    # Support secrets pasted with literal \n
    printf '%s\n' "${EC2_SSH_KEY//$'\\n'/$'\n'}" >"$_EC2_KEY_TMP"
    chmod 600 "$_EC2_KEY_TMP"
    KEY="$_EC2_KEY_TMP"
  else
    KEY="${EC2_KEY:-${ROOT:-}/services/rembeh-key-pair.pem}"
    if [[ ! -f "$KEY" ]]; then
      echo "Missing SSH key. Set EC2_KEY (path) or EC2_SSH_KEY (PEM contents)." >&2
      exit 1
    fi
    chmod 400 "$KEY" 2>/dev/null || true
  fi
}

ec2_ssh_cleanup() {
  if [[ -n "${_EC2_KEY_TMP:-}" && -f "$_EC2_KEY_TMP" ]]; then
    rm -f "$_EC2_KEY_TMP"
  fi
}

ec2_ssh() {
  ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes "$@"
}

ec2_scp() {
  scp -i "$KEY" -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes "$@"
}

# Idempotent pull/reset on the remote host (preserves secrets + build caches).
ec2_remote_pull() {
  ec2_ssh "$USER_NAME@$HOST" bash -s <<REMOTE
set -euo pipefail
REPO_URL='$REPO_URL'
BRANCH='$BRANCH'
REMOTE_DIR='$REMOTE_DIR'
if [[ -d "\$REMOTE_DIR/.git" ]]; then
  cd "\$REMOTE_DIR"
  # Prefer SSH remote if already configured (deploy key); else keep HTTPS.
  git fetch origin
  git checkout "\$BRANCH"
  git reset --hard "origin/\$BRANCH"
  git clean -fd \
    -e node_modules \
    -e dist \
    -e .env \
    -e services/api/.env \
    -e global-bundle.pem \
    -e apps/web/.next \
    -e apps/web/node_modules
else
  rm -rf "\$REMOTE_DIR"
  git clone --branch "\$BRANCH" "\$REPO_URL" "\$REMOTE_DIR"
fi
cd "\$REMOTE_DIR"
echo "Deploying commit: \$(git rev-parse --short HEAD) — \$(git log -1 --oneline)"
REMOTE
}
