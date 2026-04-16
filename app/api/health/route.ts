// app/api/health/route.ts
// Health check endpoint — protected by HEALTH_CHECK_SECRET bearer token.
// Runs all checks, tracks state transitions, and sends Telegram alerts
// when status changes (with 2-consecutive-failure flap protection).

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { runHealthChecks } from '@/app/lib/health-checks'
import { sendTelegramAlert } from '@/app/lib/alerts'

// ─── Auth ───

function isAuthorised(request: NextRequest): boolean {
  const secret = process.env.HEALTH_CHECK_SECRET
  if (!secret) return false
  const auth = request.headers.get('authorization')
  return auth === `Bearer ${secret}`
}

// ─── State tracking ───

interface HealthState {
  status: string
  consecutive_failures: number
}

async function getStoredState(): Promise<HealthState | null> {
  try {
    const { rows } = await sql`
      SELECT status, consecutive_failures FROM health_state
      WHERE check_name = 'overall'
      LIMIT 1
    `
    return rows[0]
      ? { status: rows[0].status, consecutive_failures: rows[0].consecutive_failures }
      : null
  } catch {
    return null
  }
}

async function updateStoredState(status: string, consecutiveFailures: number): Promise<void> {
  try {
    await sql`
      INSERT INTO health_state (check_name, status, consecutive_failures, last_checked_at)
      VALUES ('overall', ${status}, ${consecutiveFailures}, NOW())
      ON CONFLICT (check_name)
      DO UPDATE SET status = ${status}, consecutive_failures = ${consecutiveFailures}, last_checked_at = NOW()
    `
  } catch (error) {
    console.error('[HEALTH] Failed to update state:', error)
  }
}

// ─── Alert message builder ───

function buildAlertMessage(
  checks: Record<string, { ok: boolean; [key: string]: unknown }>
): string {
  const failing = Object.entries(checks)
    .filter(([, check]) => !check.ok)
    .map(([name, check]) => {
      const details = Object.entries(check)
        .filter(([k]) => k !== 'ok')
        .map(([k, v]) => `  ${k}: ${v}`)
        .join('\n')
      return `${name}: FAILING\n${details}`
    })

  return failing.join('\n\n') || 'Unknown issue'
}

// ─── Handler ───

export async function GET(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  try {
    const health = await runHealthChecks()
    const currentStatus = health.status

    // State transition tracking
    const stored = await getStoredState()
    const previousStatus = stored?.status || 'ok'
    const prevFailures = stored?.consecutive_failures || 0

    // Track consecutive failures (non-ok cycles)
    const consecutiveFailures = currentStatus !== 'ok' ? prevFailures + 1 : 0

    await updateStoredState(currentStatus, consecutiveFailures)

    // Alert on transition to degraded/down after 2 consecutive failures
    if (currentStatus !== 'ok' && consecutiveFailures >= 2 && previousStatus === 'ok') {
      const severity = currentStatus === 'down' ? 'critical' : 'warn'
      const message = buildAlertMessage(
        health.checks as Record<string, { ok: boolean; [key: string]: unknown }>
      )
      await sendTelegramAlert(`health-${currentStatus}`, message, severity)
    }

    // Recovery alert: transition back to ok from degraded/down
    if (currentStatus === 'ok' && previousStatus !== 'ok' && prevFailures >= 2) {
      await sendTelegramAlert(
        'health-recovery',
        'All systems recovered and operational.',
        'info'
      )
    }

    // Nudge for unacked escalations (30+ minutes)
    const escalationCheck = health.checks.lastEscalation
    if (
      escalationCheck &&
      typeof escalationCheck.oldestUnackedMinutes === 'number' &&
      escalationCheck.oldestUnackedMinutes >= 30
    ) {
      await sendTelegramAlert(
        'escalation-unacked',
        `${escalationCheck.ackPending} unacked escalation(s), oldest: ${escalationCheck.oldestUnackedMinutes}min`,
        'warn'
      )
    }

    return NextResponse.json({
      ...health,
      stateTracking: {
        previousStatus,
        consecutiveFailures,
      },
    })
  } catch (error) {
    console.error('[HEALTH] Unexpected error:', error)
    return NextResponse.json(
      { status: 'down', error: String(error), timestamp: new Date().toISOString() },
      { status: 500 }
    )
  }
}
