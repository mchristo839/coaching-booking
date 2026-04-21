#!/bin/bash
set -euo pipefail

# MCA Referral Nudges — called hourly from cron.
# POSTs to /api/referrals/nudges which processes the queue.

CONFIG_FILE="/etc/mca/health.env"
SILENCE_FILE="/etc/mca/silence"
LOG_DIR="/var/log/mca"
LOG_FILE="${LOG_DIR}/nudges.log"
MAX_LOG_SIZE=10485760  # 10MB

if [ ! -f "$CONFIG_FILE" ]; then
  echo "$(date -u '+%Y-%m-%d %H:%M:%S UTC') ERROR: Config file not found: $CONFIG_FILE" >&2
  exit 1
fi

# shellcheck source=/dev/null
. "$CONFIG_FILE"

# Validate required vars
for var in HEALTH_ENDPOINT HEALTH_SECRET; do
  eval "val=\${$var:-}"
  if [ -z "$val" ]; then
    echo "$(date -u '+%Y-%m-%d %H:%M:%S UTC') ERROR: Missing required var: $var" >&2
    exit 1
  fi
done

# Derive nudges endpoint from HEALTH_ENDPOINT
NUDGES_ENDPOINT="${HEALTH_ENDPOINT%/api/health}/api/referrals/nudges"

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
  --max-time 60 \
  -X POST \
  -H "Authorization: Bearer ${HEALTH_SECRET}" \
  "${NUDGES_ENDPOINT}" 2>&1) || {
  CURL_EXIT=$?
  echo "${TIMESTAMP} ERROR curl_exit=${CURL_EXIT}" >> "$LOG_FILE"
  exit 0
}

HTTP_BODY=$(echo "$HTTP_RESPONSE" | sed '$d')
HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -1)

if [ "$HTTP_CODE" != "200" ]; then
  echo "${TIMESTAMP} ERROR http=${HTTP_CODE}" >> "$LOG_FILE"
  exit 0
fi

PROCESSED=$(echo "$HTTP_BODY" | jq -r '.processed // 0' 2>/dev/null || echo "0")
echo "${TIMESTAMP} OK processed=${PROCESSED}" >> "$LOG_FILE"

exit 0
