#!/bin/bash
set -euo pipefail

# MCA Onboarding Nudge — Flow 0 stalled-intake re-prompt.
# Daily cron on the Contabo box. POSTs to /api/cron/onboarding-nudge, which
# re-sends the current step's prompt to anyone stalled 24h+ and marks
# anyone stalled 7d+ as abandoned.
#
# Suggested cron line (10:00 UTC ≈ 11:00 BST):
#   0 10 * * * /usr/local/bin/mca-onboarding-nudge.sh

CONFIG_FILE="/etc/mca/health.env"
LOG_DIR="/var/log/mca"
LOG_FILE="${LOG_DIR}/onboarding-nudge.log"
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

ENDPOINT="${HEALTH_ENDPOINT%/api/health}/api/cron/onboarding-nudge"

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

NUDGED=$(echo "$HTTP_BODY" | jq -r '.nudged // 0' 2>/dev/null || echo "0")
ABANDONED=$(echo "$HTTP_BODY" | jq -r '.abandoned // 0' 2>/dev/null || echo "0")
echo "${TIMESTAMP} OK nudged=${NUDGED} abandoned=${ABANDONED}" >> "$LOG_FILE"

exit 0
