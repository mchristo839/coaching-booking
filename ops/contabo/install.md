# Contabo VPS — MCA Ops Cron Setup

## Prerequisites

- Root SSH access to 161.97.176.176
- `jq` installed: `apt-get install -y jq`
- `curl` installed (should be default)

## 1. Install scripts

```bash
# Create directories
mkdir -p /opt/mca
mkdir -p /etc/mca
mkdir -p /var/log/mca

# Copy scripts
cp mca-health-check.sh /opt/mca/
cp mca-cleanup.sh /opt/mca/

# Make executable
chmod +x /opt/mca/mca-health-check.sh
chmod +x /opt/mca/mca-cleanup.sh
```

## 2. Create config file

```bash
cp health.env.example /etc/mca/health.env
chmod 600 /etc/mca/health.env
nano /etc/mca/health.env
```

Fill in the real values:
- `HEALTH_SECRET` — same value as `HEALTH_CHECK_SECRET` env var on Vercel
- `TELEGRAM_BOT_TOKEN` — the EA Telegram bot token
- `TELEGRAM_CHAT_ID` — `1412433866`

## 3. Test manually

```bash
# Test health check
/opt/mca/mca-health-check.sh
cat /var/log/mca/health.log

# Test cleanup
/opt/mca/mca-cleanup.sh
cat /var/log/mca/cleanup.log
```

You should see a log line like:
```
2026-04-16 10:23:45 UTC status=ok http=200 latency=450ms
```

## 4. Add to cron

```bash
crontab -e
```

Add these lines:

```cron
*/5 * * * * /opt/mca/mca-health-check.sh
0 4 * * * /opt/mca/mca-cleanup.sh
0 * * * * /opt/mca/mca-referral-nudges.sh
0 16 * * * /opt/mca/mca-session-reminders.sh
```

Health check every 5 minutes. Cleanup daily at 04:00 UTC. Referral nudges
hourly. Session reminders daily at 16:00 UTC (≈17:00 BST) — fires the
day-before message to each coach with attendance from the latest poll. The
session-reminders endpoint is idempotent within a 23h window, so a
duplicate run won't double-send.

Don't forget to copy the new scripts into place before adding the cron lines:

```bash
cp mca-referral-nudges.sh /opt/mca/
cp mca-session-reminders.sh /opt/mca/
chmod +x /opt/mca/mca-referral-nudges.sh
chmod +x /opt/mca/mca-session-reminders.sh
```

## 5. Verify cron is running

Wait 5 minutes, then:

```bash
tail -5 /var/log/mca/health.log
```

## Silencing alerts temporarily

To suppress Telegram alerts without stopping the cron (e.g. during planned maintenance):

```bash
# Silence alerts
touch /etc/mca/silence

# Resume alerts
rm /etc/mca/silence
```

Scripts still log normally when silenced — they just skip the Telegram send.

## Checking logs

```bash
# Recent health checks
tail -20 /var/log/mca/health.log

# Recent cleanups
tail -5 /var/log/mca/cleanup.log

# Find errors
grep ERROR /var/log/mca/health.log
```

## Optional: logrotate

If you prefer system logrotate over the inline rotation:

```bash
cp mca-logrotate.conf /etc/logrotate.d/mca
```

Both approaches work safely together. The scripts do inline rotation (move to .1 at 10MB). Logrotate does weekly rotation with compression. Having both is harmless.

## Troubleshooting

| Problem | Check |
|---------|-------|
| No log entries | `crontab -l` — is the job listed? |
| "Config file not found" | `ls -la /etc/mca/health.env` — does it exist? |
| "jq not installed" | `apt-get install -y jq` |
| Alerts still firing when silenced | `ls -la /etc/mca/silence` — does the file exist? |
| HTTP 401 errors | Check `HEALTH_SECRET` matches `HEALTH_CHECK_SECRET` on Vercel |
