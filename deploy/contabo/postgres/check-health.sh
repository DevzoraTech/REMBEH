#!/bin/sh
set -eu

health=$(docker inspect --format '{{.State.Health.Status}}' antikra-postgres)
[ "$health" = healthy ] || { echo "PostgreSQL is not healthy" >&2; exit 1; }

docker exec --user postgres antikra-postgres psql -U postgres -d postgres -At \
  -v ON_ERROR_STOP=1 -c "SELECT CASE WHEN last_failed_time IS NOT NULL AND (last_archived_time IS NULL OR last_failed_time > last_archived_time) THEN 1 ELSE 0 END FROM pg_stat_archiver" | \
  grep -qx 0 || { echo "WAL archiving is failing" >&2; exit 1; }

docker exec --user postgres antikra-postgres pgbackrest --stanza=antikra --output=json info | \
  jq -e '.[0].status.code == 0 and ([.[0].backup[].timestamp.stop] | max // 0) > (now - 90000)' >/dev/null || \
  { echo "No recent successful database backup" >&2; exit 1; }

used=$(df -P /srv/antikra | awk 'NR==2 {gsub(/%/, "", $5); print $5}')
[ "$used" -lt 85 ] || { echo "VPS disk usage is above the alert threshold" >&2; exit 1; }
