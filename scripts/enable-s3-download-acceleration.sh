#!/usr/bin/env bash
# Enable S3 Transfer Acceleration on the production APK bucket.
# Phones in East Africa then reach S3 through the nearest CloudFront edge
# instead of a slow public path into Cape Town.
#
# This often returns MethodNotAllowed from the EC2 VPC endpoint. If it does,
# enable Acceleration in the AWS console:
#   S3 → rembeh-production-file-bk → Properties → Transfer Acceleration
# Then leave APK_PUBLIC_BASE_URL unset (or keep nginx as the primary).
#
# Usage:
#   ./scripts/enable-s3-download-acceleration.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/ec2-ssh.sh
source "$SCRIPT_DIR/lib/ec2-ssh.sh"

ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOST="${EC2_HOST:-15.240.28.47}"
USER_NAME="${EC2_USER:-ubuntu}"
BUCKET="${EXPECTED_S3_BUCKET:-rembeh-production-file-bk}"
REGION="${EXPECTED_S3_REGION:-af-south-1}"

ec2_resolve_key
trap ec2_ssh_cleanup EXIT

echo "==> Enabling S3 Transfer Acceleration on s3://$BUCKET ($REGION)..."

ec2_ssh "$USER_NAME@$HOST" bash -s -- "$BUCKET" "$REGION" <<'REMOTE'
set -euo pipefail
BUCKET="$1"
REGION="$2"

if ! command -v aws >/dev/null 2>&1; then
  echo "AWS CLI is missing on EC2." >&2
  exit 1
fi

current="$(aws s3api get-bucket-accelerate-configuration \
  --bucket "$BUCKET" \
  --region "$REGION" \
  --output json 2>/dev/null || true)"

echo "Current acceleration: ${current:-<unset>}"

aws s3api put-bucket-accelerate-configuration \
  --bucket "$BUCKET" \
  --region "$REGION" \
  --accelerate-configuration Status=Enabled

aws s3api get-bucket-accelerate-configuration \
  --bucket "$BUCKET" \
  --region "$REGION" \
  --output json
REMOTE

echo "S3 Transfer Acceleration enabled."
echo "API download URLs will use *.s3-accelerate.amazonaws.com after rembeh-api restarts."
