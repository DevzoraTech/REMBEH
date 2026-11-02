#!/usr/bin/env bash
set -Eeuo pipefail
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
version=${1:?Version required}; build=${2:?Build required}
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$build" =~ ^[1-9][0-9]*$ ]] || { echo 'Invalid version or build' >&2; exit 1; }
host=${CONTABO_HOST:-84.247.184.219}; user=${CONTABO_USER:-antikra}; key=${CONTABO_KEY:-$HOME/.ssh/antikra_production}
opts=(-i "$key" -o StrictHostKeyChecking=yes)
encoded=$(base64 < "$root/scripts/contabo-mobile-next-version.cjs" | tr -d '\n')
# Keep sudo and the lookup in the same SSH session: some servers scope sudo
# authentication to the terminal. Show the password prompt while capturing output.
output=$(ssh -tt "${opts[@]}" "$user@$host" "sudo docker exec -e NODE_PATH=/app/node_modules rembeh-api node -e \"\$(printf '%s' '$encoded' | base64 -d)\" '$version' '$build'" </dev/tty | tee /dev/tty)
result=$(printf '%s\n' "$output" | tr -d '\r' | sed -nE 's/.*(^|[^0-9])([0-9]+\.[0-9]+\.[0-9]+ [1-9][0-9]*)$/\2/p' | tail -1)
[[ "$result" =~ ^[0-9]+\.[0-9]+\.[0-9]+\ [1-9][0-9]*$ ]] || { echo 'Invalid response from release version lookup' >&2; exit 1; }
printf '%s\n' "$result"
