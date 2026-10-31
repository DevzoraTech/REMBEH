#!/bin/sh
set -eu

for container in rembeh-api rembeh-web antikra-rembeh-site antikra-payments-api antikra-redis; do
  state=$(docker inspect --format '{{.State.Status}} {{.State.Health.Status}}' "$container")
  [ "$state" = 'running healthy' ] || { echo "$container is not healthy" >&2; exit 1; }
done
[ "$(docker inspect --format '{{.State.Status}}' antikra-traefik)" = running ] || \
  { echo 'HTTPS proxy is not running' >&2; exit 1; }

curl --noproxy '*' --fail --silent --show-error --max-time 15 \
  --resolve rembeh-api.antikra.com:443:127.0.0.1 \
  https://rembeh-api.antikra.com/api/v1/platform/health | \
  jq -e '.status == "ok" and .database == "up"' >/dev/null

for host in rembeh.antikra.com rembeh-api.antikra.com get.rembeh.antikra.com; do
  cert=$(printf '' | timeout 15 openssl s_client -connect 127.0.0.1:443 \
    -servername "$host" 2>/dev/null)
  printf '%s\n' "$cert" | openssl x509 -noout -checkhost "$host" -checkend 604800 >/dev/null || \
    { echo "Certificate for $host is invalid or expires within seven days" >&2; exit 1; }
done
