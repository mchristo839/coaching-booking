// app/lib/alerts.ts
// Telegram alert dispatcher with dedup via alert_log table.
// Never throws — logging failure must not break the caller.

import { sql } from '@vercel/postgres'

type Severity = 'info' | 'warn' | 'critical'

const SEVERITY_EMOJI: Record<Severity, string> = {
  critical: '🔴',
  warn: '🟡',
  info: '🔵',
}

/**
 * Send a Telegram alert, deduplicating by alert_key.
 * Won't send the same alert_key more than once per 30 minutes.
 */
export async function sendTelegramAlert(
  alertKey: string,
  message: string,
  severity: Severity
): Promise<boolean> {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_CHAT_ID
    const prefix = process.env.MCA_ALERT_PREFIX || '[MCA]'

    if (!token || !chatId) {
      console.error('[ALERT] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID')
      return false
    }

    // Dedup: check if we sent this alert in the last 30 minutes
    const { rows: recent } = await sql`
      SELECT id FROM alert_log
      WHERE alert_key = ${alertKey}
        AND sent_at > NOW() - INTERVAL '30 minutes'
      LIMIT 1
    `

    if (recent.length > 0) {
      console.log(`[ALERT] Dedup: skipping ${alertKey} (sent within 30m)`)
      return false
    }

    const emoji = SEVERITY_EMOJI[severity]
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
    const text = `${prefix} ${emoji} ${severity.toUpperCase()}\n${message}\nat ${timestamp}`

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error(`[ALERT] Telegram API error: ${res.status} ${body}`)
      return false
    }

    // Log the sent alert for dedup
    await sql`
      INSERT INTO alert_log (alert_key, severity, message)
      VALUES (${alertKey}, ${severity}, ${message})
    `

    console.log(`[ALERT] Sent: ${severity} ${alertKey}`)
    return true
  } catch (error) {
    console.error('[ALERT] Failed to send alert:', error)
    return false
  }
}
