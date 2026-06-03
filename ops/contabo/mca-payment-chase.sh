#!/bin/bash
set -euo pipefail

# MCA Payment Chase — Flow 7 (PT sessions) + holiday-camp chase ladders.
# Daily cron on the Contabo box. POSTs to /api/cron/payment-chase, which:
#   • chases unpaid pt_sessions past their session date, and
#   • runs the camp ladders: nudges parents who haven't paid the camp link
#     (+24h/+48h) and reminds coaches about reported-but-unconfirmed payments
#     (+24h/+48h). All idempotent via chase-step columns, so duplicate runs
#     are safe.
#
# Suggested cron line (daily at 09:00 UTC):
#   0 9 * * * /opt/mca/mca-payment-chase.sh

CONFIG_FILE="/etc/mca/health.env"
LOG_DIR="/var/log/mca"
LOG_FILE="${LOG_DIR}/payment-chase.log"
MAX_LOG_SIZE=10485760  # 10MB

if [ ! -f "$CONFIG_FILE" ]; then
  echo "$(date -u '+%Y-%m-%d %H:%M:%S UTC') ERROR: Config file not found: $CONFIG_FILE" >&2
  exit 1
fi

# shellcheck source=/dev/null
. "$CONFIG_FILE"

for var in HEALTH_ENDPOINT HEALTH_SECRET; do
  eval "val=\${$var:-}"
  if [ -z "$val" ]; then
    echo "$(date -u '+%Y-%m-%d %H:%M:%S UTC') ERROR: Missing required var: $var" >&2
    exit 1
  fi
done

ENDPOINT="${HEALTH_ENDPOINT%/api/health}/api/cron/payment-chase"

mkdir -p "$LOG_DIR"
if [ -f "$LOG_FILE" ]; then
  size=$(stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)
  if [ "$size" -gt "$MAX_LOG_SIZE" ]; then
    mv "$LOG_FILE" "${LOG_FILE}.1"
  fi
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "$(date -u '+%Y-%m-%d %H:%M:%S UTC') ERROR: jq not installed" >&2
  exit 1
fi

TIMESTAMP=$(date -u '+%Y-%m-%d %H:%M:%S UTC')

HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" \
  --max-time 120 \
  -X POST \
  -H "Authorization: Bearer ${HEALTH_SECRET}" \
  "${ENDPOINT}" 2>&1) || {
  CURL_EXIT=$?
  echo "${TIMESTAMP} ERROR curl_exit=${CURL_EXIT}" >> "$LOG_FILE"
  exit 0
}

HTTP_BODY=$(echo "$HTTP_RESPONSE" | sed '$d')
HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -1)

if [ "$HTTP_CODE" != "200" ]; then
  echo "${TIMESTAMP} ERROR http=${HTTP_CODE} body=${HTTP_BODY}" >> "$LOG_FILE"
  exit 0
fi

PT_FIRED=$(echo "$HTTP_BODY" | jq -r '.fired // 0' 2>/dev/null || echo "0")
CAMP_PARENT=$(echo "$HTTP_BODY" | jq -r '.camp.parentNudged // 0' 2>/dev/null || echo "0")
CAMP_COACH=$(echo "$HTTP_BODY" | jq -r '.camp.coachReminded // 0' 2>/dev/null || echo "0")
echo "${TIMESTAMP} OK pt_fired=${PT_FIRED} camp_parent=${CAMP_PARENT} camp_coach=${CAMP_COACH}" >> "$LOG_FILE"

exit 0
