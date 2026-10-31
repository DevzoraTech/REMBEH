#!/bin/sh
set -eu
umask 077

base=${1:-/srv/antikra/infrastructure/redis}
client=${2:-/srv/antikra/services/rembeh/secrets/redis-client.env}
mkdir -p "$base/secrets" "$base/data"
chmod 700 "$base/secrets" "$base/data"
for file in "$base/secrets/users.acl" "$base/secrets/health.env" "$client"; do
  [ ! -e "$file" ] || { echo "Refusing to replace existing Redis credentials: $file" >&2; exit 1; }
done
password=$(openssl rand -hex 32)
digest=$(printf '%s' "$password" | sha256sum | awk '{print $1}')
printf 'user default off\nuser rembeh on #%s ~rembeh:rate-limit:v1:* -@all +ping +info +incr +pexpire +pttl +client|setinfo\n' "$digest" > "$base/secrets/users.acl"
printf 'REDISCLI_AUTH=%s\n' "$password" > "$base/secrets/health.env"
printf 'REDIS_URL=redis://rembeh:%s@antikra-redis:6379\n' "$password" > "$client"
chmod 600 "$base/secrets/users.acl" "$base/secrets/health.env" "$client"
echo 'Redis credentials created; no secrets were printed.'
