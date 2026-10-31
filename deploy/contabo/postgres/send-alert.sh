#!/bin/sh
set -eu

unit=${1:-unknown}
subject="ANTIKRA infrastructure alert: $unit"
message="The $unit service needs attention on the ANTIKRA VPS. Check the server and system logs."
if [ "$unit" = test ]; then
  subject="ANTIKRA infrastructure alert test"
  message="This is a test of the ANTIKRA server alert system."
fi

: "${RESEND_API_KEY:?Missing email service key}"
: "${EMAIL_FROM:?Missing sender address}"
: "${ALERT_EMAIL:?Missing alert recipient}"
payload=$(jq -n --arg from "$EMAIL_FROM" --arg to "$ALERT_EMAIL" \
  --arg subject "$subject" --arg message "$message" \
  '{from:$from,to:[$to],subject:$subject,text:$message}')

printf 'header = "Authorization: Bearer %s"\n' "$RESEND_API_KEY" | \
  curl --config - --fail-with-body --silent --show-error --connect-timeout 10 \
    --max-time 30 -H 'Content-Type: application/json' \
    --data "$payload" https://api.resend.com/emails >/dev/null
