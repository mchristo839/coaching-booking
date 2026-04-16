#!/bin/sh
set -euo pipefail

# MCA Cleanup — called daily from cron.
# POSTs to the maintenance/cleanup endpoint to purge stale
# processed_messages rows.

CONFIG_FILE="/etc/mca/health.env"
SILENCE_FILE="/etc/mca/silence"
LOG_DIR="/var/log/mca"
LOG_FILE="${LOG_DIR}/cleanup.log"
MAX_LOG_SIZE=10485760  # 10MB

# ─── Load config ───

if [ ! -f "$CONFIG_FILE" ]; then
  echo "$(date -u '+%Y-%m-%d %H:%M:%S UTC') ERROR: Config file not found: $CONFIG_FILE" >&2
  exit 1
fi

# shellcheck source=/dev/null
. "$CONFIG_FILE"

for var in CLEANUP_ENDPOINT HEALTH_SECRET TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID; do
  eval "val=\${$var:-}"
  if [ -z "$val" ]; then
    echo "$(date -u '+%Y-%m-%d %H:%M:%S UTC') ERROR: Missing required var: $var" >&2
    exit 1
  fi
done

MCA_ALERT_PREFIX="${MCA_ALERT_PREFIX:-[MCA]}"

# ─── Helpers ───

send_telegram() {
  if [ -f "$SILENCE_FILE" ]; then
    echo "$(date -u '+%Y-%m-%d %H:%M:%S UTC') SILENCED: would have sent: $1"
    return 0
  fi
  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -H "Content-Type: application/json" \
    -d "{\"chat_id\": \"${TELEGRAM_CHAT_ID}\", \"text\": $(printf '%s' "$1" | jq -Rs .)}" \
    >/dev/null 2>&1 || true
}

rotate_log() {
  if [ -f "$LOG_FILE" ]; then
    size=$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)
    if [ "$size" -gt "$MAX_LOG_SIZE" ]; then
      mv "$LOG_FILE" "${LOG_FILE}.1"
    fi
  fi
}

# ─── Ensure log directory + jq ───

mkdir -p "$LOG_DIR"
rotate_log

if ! command -v jq >/dev/null 2>&1; then
  send_telegram "${MCA_ALERT_PREFIX} 🔴 CRITICAL
jq not installed. Cleanup script cannot run.
Install with: apt-get install -y jq"
  exit 1
fi

# ─── Run cleanup ───

TIMESTAMP=$(date -u '+%Y-%m-%d %H:%M:%S UTC')

HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" \
  --max-time 30 \
  -X POST \
  -H "Authorization: Bearer ${HEALTH_SECRET}" \
  "${CLEANUP_ENDPOINT}" 2>&1) || {
  CURL_EXIT=$?
  echo "${TIMESTAMP} ERROR curl_exit=${CURL_EXIT}" >> "$LOG_FILE"
  send_telegram "${MCA_ALERT_PREFIX} 🟡 WARN
Cleanup endpoint unreachable
curl exit code: ${CURL_EXIT}
at ${TIMESTAMP}"
  exit 0
}

HTTP_BODY=$(echo "$HTTP_RESPONSE" | sed '$d')
HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -1)

if [ "$HTTP_CODE" != "200" ]; then
  echo "${TIMESTAMP} ERROR http=${HTTP_CODE}" >> "$LOG_FILE"
  send_telegram "${MCA_ALERT_PREFIX} 🟡 WARN
Cleanup endpoint returned HTTP ${HTTP_CODE}
at ${TIMESTAMP}"
  exit 0
fi

DELETED=$(echo "$HTTP_BODY" | jq -r '.deleted // "unknown"' 2>/dev/null || echo "parse_error")
echo "${TIMESTAMP} OK deleted=${DELETED}" >> "$LOG_FILE"

exit 0
