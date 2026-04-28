#!/bin/bash
set -euo pipefail

# MCA Session Reminders — called once per day from cron.
# POSTs to /api/cron/session-reminders, which DMs each coach a heads-up
# the day before any scheduled training/fixture (with attendance from
# the latest poll, when available).
#
# Suggested cron line on the Contabo box (runs at 17:00 London time):
#   0 16 * * * /usr/local/bin/mca-session-reminders.sh
# (16:00 UTC ≈ 17:00 BST — adjust to taste; the endpoint is idempotent
#  within a 23h window so a duplicate run won't double-send.)

CONFIG_FILE="/etc/mca/health.env"
LOG_DIR="/var/log/mca"
LOG_FILE="${LOG_DIR}/session-reminders.log"
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

# Derive session-reminders endpoint from HEALTH_ENDPOINT
REMINDERS_ENDPOINT="${HEALTH_ENDPOINT%/api/health}/api/cron/session-reminders"

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
  "${REMINDERS_ENDPOINT}" 2>&1) || {
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

SENT=$(echo "$HTTP_BODY" | jq -r '.sent // 0' 2>/dev/null || echo "0")
FAILED=$(echo "$HTTP_BODY" | jq -r '.failed // 0' 2>/dev/null || echo "0")
SKIPPED=$(echo "$HTTP_BODY" | jq -r '.skipped // 0' 2>/dev/null || echo "0")
TARGET_DATE=$(echo "$HTTP_BODY" | jq -r '.targetDate // "unknown"' 2>/dev/null || echo "unknown")
echo "${TIMESTAMP} OK target=${TARGET_DATE} sent=${SENT} failed=${FAILED} skipped=${SKIPPED}" >> "$LOG_FILE"

exit 0
