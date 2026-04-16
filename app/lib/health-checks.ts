// app/lib/health-checks.ts
// Shared health check logic — used by both /api/health and /api/cron/health-check.

import { sql } from '@vercel/postgres'

// ─── Anthropic ping cache (avoid API cost on every check) ───

let anthropicCache: { ok: boolean; latencyMs: number; cachedAt: number } | null = null
const ANTHROPIC_CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

// ─── Types ───

interface CheckResult {
  ok: boolean
  [key: string]: unknown
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down'
  checks: Record<string, CheckResult>
  timestamp: string
}

// ─── Individual checks ───

async function checkEvolutionApi(): Promise<CheckResult> {
  const url = process.env.EVOLUTION_API_URL || 'http://161.97.176.176:8080'
  const instance = process.env.EVOLUTION_INSTANCE || 'paul-bot'
  const apiKey = process.env.EVOLUTION_API_KEY || ''

  try {
    const start = Date.now()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const res = await fetch(`${url}/instance/connectionState/${instance}`, {
      headers: { apikey: apiKey },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    const latencyMs = Date.now() - start
    const data = await res.json()
    const state = data?.instance?.state || data?.state || 'unknown'

    return { ok: state === 'open', state, latencyMs }
  } catch (error) {
    return { ok: false, state: 'unreachable', error: String(error) }
  }
}

async function checkPostgres(): Promise<CheckResult> {
  try {
    const start = Date.now()
    await sql`SELECT 1`
    const latencyMs = Date.now() - start
    return { ok: true, latencyMs }
  } catch (error) {
    return { ok: false, error: String(error) }
  }
}

async function checkAnthropicApi(): Promise<CheckResult> {
  // Return cached result if fresh
  if (anthropicCache && Date.now() - anthropicCache.cachedAt < ANTHROPIC_CACHE_TTL_MS) {
    return { ok: anthropicCache.ok, latencyMs: anthropicCache.latencyMs, cached: true }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY || ''
  if (!apiKey) {
    return { ok: false, error: 'ANTHROPIC_API_KEY not set' }
  }

  try {
    const start = Date.now()
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    })

    const latencyMs = Date.now() - start
    const ok = res.ok

    anthropicCache = { ok, latencyMs, cachedAt: Date.now() }
    return { ok, latencyMs }
  } catch (error) {
    anthropicCache = { ok: false, latencyMs: -1, cachedAt: Date.now() }
    return { ok: false, error: String(error) }
  }
}

async function checkLastMessageSent(): Promise<CheckResult> {
  try {
    const { rows } = await sql`
      SELECT created_at FROM conversations
      WHERE bot_response IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1
    `

    if (rows.length === 0) {
      return { ok: true, ageMinutes: null, note: 'no data yet' }
    }

    const lastSent = new Date(rows[0].created_at)
    const ageMinutes = Math.round((Date.now() - lastSent.getTime()) / 60000)

    // Only warn during UK daytime (08:00-22:00 Europe/London)
    const londonHour = parseInt(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/London',
        hour: 'numeric',
        hour12: false,
      }).format(new Date()),
      10
    )
    const isDaytime = londonHour >= 8 && londonHour < 22
    const stale = isDaytime && ageMinutes > 360 // 6 hours

    return { ok: !stale, ageMinutes, isDaytime }
  } catch (error) {
    return { ok: true, error: String(error), note: 'table may not exist yet' }
  }
}

async function checkLastEscalation(): Promise<CheckResult> {
  try {
    const { rows } = await sql`
      SELECT COUNT(*) as count FROM conversations
      WHERE escalated = true
        AND escalation_acked_at IS NULL
        AND created_at > NOW() - INTERVAL '24 hours'
    `

    const ackPending = parseInt(rows[0]?.count || '0', 10)

    let oldestUnackedMinutes: number | null = null
    if (ackPending > 0) {
      const { rows: oldest } = await sql`
        SELECT created_at FROM conversations
        WHERE escalated = true
          AND escalation_acked_at IS NULL
          AND created_at > NOW() - INTERVAL '24 hours'
        ORDER BY created_at ASC
        LIMIT 1
      `
      if (oldest.length > 0) {
        oldestUnackedMinutes = Math.round(
          (Date.now() - new Date(oldest[0].created_at).getTime()) / 60000
        )
      }
    }

    return { ok: true, ackPending, oldestUnackedMinutes }
  } catch (error) {
    return { ok: true, ackPending: 0, error: String(error), note: 'table may not exist yet' }
  }
}

async function checkDuplicateSends(): Promise<CheckResult> {
  try {
    const { rows } = await sql`
      SELECT COUNT(*) as dup_count FROM (
        SELECT group_jid, reply_type, sent_at,
          LAG(sent_at) OVER (PARTITION BY group_jid, reply_type ORDER BY sent_at) as prev_sent
        FROM bot_replies
        WHERE sent_at > NOW() - INTERVAL '1 hour'
      ) sub
      WHERE prev_sent IS NOT NULL
        AND EXTRACT(EPOCH FROM (sent_at - prev_sent)) < 10
    `

    const countLast1h = parseInt(rows[0]?.dup_count || '0', 10)
    return { ok: countLast1h === 0, countLast1h }
  } catch (error) {
    return { ok: true, countLast1h: 0, error: String(error), note: 'table may not exist yet' }
  }
}

// ─── Main runner ───

export async function runHealthChecks(): Promise<HealthResponse> {
  const [evolutionApi, postgres, anthropicApi, lastMessageSent, lastEscalation, duplicateSends] =
    await Promise.all([
      checkEvolutionApi(),
      checkPostgres(),
      checkAnthropicApi(),
      checkLastMessageSent(),
      checkLastEscalation(),
      checkDuplicateSends(),
    ])

  const checks = {
    evolutionApi,
    postgres,
    anthropicApi,
    lastMessageSent,
    lastEscalation,
    duplicateSends,
  }

  let status: 'ok' | 'degraded' | 'down' = 'ok'

  if (!postgres.ok || !evolutionApi.ok) {
    status = 'down'
  } else if (!anthropicApi.ok || !lastMessageSent.ok || !duplicateSends.ok) {
    status = 'degraded'
  }

  return {
    status,
    checks,
    timestamp: new Date().toISOString(),
  }
}
