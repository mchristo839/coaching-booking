#!/bin/bash
set -euo pipefail

# MCA Health Check — called every 5 minutes from cron.
# Hits the Vercel health endpoint. If unreachable, sends its own
# Telegram alert as a safety net. If reachable, the endpoint
# handles its own alerting — this script just logs.

CONFIG_FILE="/etc/mca/health.env"
SILENCE_FILE="/etc/mca/silence"
LOG_DIR="/var/log/mca"
LOG_FILE="${LOG_DIR}/health.log"
MAX_LOG_SIZE=10485760  # 10MB

# ─── Load config ───

if [ ! -f "$CONFIG_FILE" ]; then
  echo "$(date -u '+%Y-%m-%d %H:%M:%S UTC') ERROR: Config file not found: $CONFIG_FILE" >&2
  exit 1
fi

# shellcheck source=/dev/null
. "$CONFIG_FILE"

# Validate required vars
for var in HEALTH_ENDPOINT HEALTH_SECRET TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID; do
  eval "val=\${$var:-}"
  if [ -z "$val" ]; then
    echo "$(date -u '+%Y-%m-%d %H:%M:%S UTC') ERROR: Missing required var: $var" >&2
    exit 1
  fi
done

MCA_ALERT_PREFIX="${MCA_ALERT_PREFIX:-[MCA]}"

# ─── Check for jq ───

if ! command -v jq >/dev/null 2>&1; then
  send_telegram "${MCA_ALERT_PREFIX} 🔴 CRITICAL
jq is not installed on Contabo VPS.
Health check script cannot parse responses.
Install with: apt-get install -y jq"
  echo "$(date -u '+%Y-%m-%d %H:%M:%S UTC') ERROR: jq not installed" >&2
  exit 1
fi

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

# ─── Ensure log directory ───

mkdir -p "$LOG_DIR"
rotate_log

# ─── Run health check ───

TIMESTAMP=$(date -u '+%Y-%m-%d %H:%M:%S UTC')
START_MS=$(date +%s%3N 2>/dev/null || date +%s)

HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" \
  --max-time 10 \
  -L \
  -H "Authorization: Bearer ${HEALTH_SECRET}" \
  "${HEALTH_ENDPOINT}" 2>&1) || {
  # curl itself failed (timeout, connection error, DNS failure)
  CURL_EXIT=$?
  echo "${TIMESTAMP} UNREACHABLE curl_exit=${CURL_EXIT}" >> "$LOG_FILE"
  send_telegram "${MCA_ALERT_PREFIX} 🔴 CRITICAL
Health endpoint unreachable
endpoint: ${HEALTH_ENDPOINT}
curl exit code: ${CURL_EXIT}
at ${TIMESTAMP}"
  exit 0
}

# Split response body and HTTP status code
HTTP_BODY=$(echo "$HTTP_RESPONSE" | sed '$d')
HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -1)
END_MS=$(date +%s%3N 2>/dev/null || date +%s)
LATENCY=$((END_MS - START_MS))

# Non-200 response
if [ "$HTTP_CODE" != "200" ]; then
  echo "${TIMESTAMP} ERROR http=${HTTP_CODE} latency=${LATENCY}ms" >> "$LOG_FILE"
  send_telegram "${MCA_ALERT_PREFIX} 🔴 CRITICAL
Health endpoint returned HTTP ${HTTP_CODE}
endpoint: ${HEALTH_ENDPOINT}
at ${TIMESTAMP}"
  exit 0
fi

# Parse status from JSON
STATUS=$(echo "$HTTP_BODY" | jq -r '.status // "unknown"' 2>/dev/null || echo "parse_error")

if [ "$STATUS" = "parse_error" ]; then
  echo "${TIMESTAMP} ERROR parse_error latency=${LATENCY}ms" >> "$LOG_FILE"
  send_telegram "${MCA_ALERT_PREFIX} 🟡 WARN
Health endpoint returned unparseable response
endpoint: ${HEALTH_ENDPOINT}
at ${TIMESTAMP}"
  exit 0
fi

# Log the result (endpoint already handles its own alerting)
echo "${TIMESTAMP} status=${STATUS} http=${HTTP_CODE} latency=${LATENCY}ms" >> "$LOG_FILE"

exit 0
