// app/api/cron/poll-reminders/route.ts
// Flow 1 — Group session poll reminders.
//
// Designed to be hit hourly from Contabo. For each poll with a session_at
// in the future, we send two reminders:
//
//   * T-24h: a coach digest DM listing confirmed/waitlist counts so the
//             coach knows the room size before they walk in.
//   * T-2h:  a 1:1 nudge to every YES voter ("see you at HH:MM at venue").
//
// Idempotency is enforced by `reminded_24h_at` / `reminded_2h_at` on polls.
// We only fire when the relevant column is null AND the session_at is
// within the cron window (T-24h: 18-30h ahead; T-2h: 0-3h ahead).
//
// Auth: Bearer HEALTH_CHECK_SECRET (matches the rest of the cron family).

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/app/lib/sql'
import { sendWhatsAppMessage } from '@/app/lib/evolution'

export const dynamic = 'force-dynamic'

function isAuthorised(request: NextRequest): boolean {
  const secret = (process.env.HEALTH_CHECK_SECRET || '').trim()
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

function formatSessionTime(iso: string): string {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
  return `${date} at ${time}`
}

interface PollRow {
  id: string
  question: string
  options: unknown
  yes_option_index: number | null
  capacity: number | null
  session_at: string
  payment_link: string | null
  reminded_24h_at: string | null
  reminded_2h_at: string | null
  coach_id: string | null
  coach_phone: string | null
}

interface Outcome {
  poll_id: string
  kind: 't24h_coach' | 't2h_attendees'
  status: 'sent' | 'skipped_no_yes_option' | 'skipped_no_coach_jid' | 'failed' | 'no_attendees'
  recipients?: number
  error?: string
}

async function loadPolls(): Promise<PollRow[]> {
  // Look at any poll with session_at in the next 31 hours that hasn't fired
  // both reminders yet. The narrow window keeps the query cheap.
  const { rows } = await sql`
    SELECT
      p.id, p.question, p.options, p.yes_option_index, p.capacity,
      p.session_at, p.payment_link,
      p.reminded_24h_at, p.reminded_2h_at,
      p.created_by as coach_id,
      c.mobile as coach_phone
    FROM polls p
    LEFT JOIN coaches_v2 c ON c.id = p.created_by
    WHERE p.session_at IS NOT NULL
      AND p.session_at > NOW()
      AND p.session_at < NOW() + INTERVAL '31 hours'
      AND (p.reminded_24h_at IS NULL OR p.reminded_2h_at IS NULL)
  `
  return rows as PollRow[]
}

function yesOptionFor(p: PollRow): string | null {
  const arr: string[] = Array.isArray(p.options)
    ? (p.options as string[])
    : JSON.parse((p.options as string) || '[]')
  const idx = p.yes_option_index ?? 0
  return arr[idx] ?? null
}

function coachJidFromPhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  return `${digits}@s.whatsapp.net`
}

async function fireT24hCoach(p: PollRow): Promise<Outcome> {
  const coachJid = coachJidFromPhone(p.coach_phone)
  if (!coachJid) {
    await sql`UPDATE polls SET reminded_24h_at = NOW() WHERE id = ${p.id}`
    return { poll_id: p.id, kind: 't24h_coach', status: 'skipped_no_coach_jid' }
  }

  const yesOpt = yesOptionFor(p)
  if (!yesOpt) {
    await sql`UPDATE polls SET reminded_24h_at = NOW() WHERE id = ${p.id}`
    return { poll_id: p.id, kind: 't24h_coach', status: 'skipped_no_yes_option' }
  }

  const { rows: cRows } = await sql`
    SELECT COUNT(*)::int as n FROM poll_responses
    WHERE poll_id = ${p.id} AND chosen_option = ${yesOpt}
  `
  const confirmed = Number(cRows[0]?.n ?? 0)

  const { rows: wRows } = await sql`
    SELECT COUNT(*)::int as n FROM waitlist
    WHERE poll_id = ${p.id} AND status = 'waiting'
  `
  const waiting = Number(wRows[0]?.n ?? 0)

  const cap = p.capacity != null ? ` (cap ${p.capacity})` : ''
  const wl = waiting > 0 ? `\n📋 Waitlist: ${waiting}` : ''
  const msg = `⏰ Tomorrow: "${p.question}"\n${formatSessionTime(p.session_at)}\n\n✅ Confirmed: ${confirmed}${cap}${wl}`

  try {
    await sendWhatsAppMessage(coachJid, msg)
    await sql`UPDATE polls SET reminded_24h_at = NOW() WHERE id = ${p.id}`
    return { poll_id: p.id, kind: 't24h_coach', status: 'sent', recipients: 1 }
  } catch (e) {
    return {
      poll_id: p.id,
      kind: 't24h_coach',
      status: 'failed',
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

async function fireT2hAttendees(p: PollRow): Promise<Outcome> {
  const yesOpt = yesOptionFor(p)
  if (!yesOpt) {
    await sql`UPDATE polls SET reminded_2h_at = NOW() WHERE id = ${p.id}`
    return { poll_id: p.id, kind: 't2h_attendees', status: 'skipped_no_yes_option' }
  }

  const { rows: voters } = await sql`
    SELECT sender_jid, sender_name FROM poll_responses
    WHERE poll_id = ${p.id} AND chosen_option = ${yesOpt}
  `

  if (voters.length === 0) {
    await sql`UPDATE polls SET reminded_2h_at = NOW() WHERE id = ${p.id}`
    return { poll_id: p.id, kind: 't2h_attendees', status: 'no_attendees' }
  }

  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(p.session_at))

  const msg = `⏰ See you in 2 hours for "${p.question}" at ${time}. 🔥`

  let sent = 0
  for (const v of voters) {
    try {
      await sendWhatsAppMessage(v.sender_jid as string, msg)
      sent++
    } catch (e) {
      console.error(`[poll-reminders] T-2h send failed for ${v.sender_jid}:`, e)
    }
  }

  await sql`UPDATE polls SET reminded_2h_at = NOW() WHERE id = ${p.id}`
  return { poll_id: p.id, kind: 't2h_attendees', status: 'sent', recipients: sent }
}

export async function POST(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const polls = await loadPolls()
  const now = Date.now()
  const outcomes: Outcome[] = []

  for (const p of polls) {
    const sessionMs = new Date(p.session_at).getTime()
    const hoursAhead = (sessionMs - now) / (1000 * 60 * 60)

    // T-24h window: between 18h and 30h ahead, fire if not yet fired
    if (!p.reminded_24h_at && hoursAhead >= 18 && hoursAhead <= 30) {
      outcomes.push(await fireT24hCoach(p))
    }

    // T-2h window: between 0h and 3h ahead, fire if not yet fired
    if (!p.reminded_2h_at && hoursAhead >= 0 && hoursAhead <= 3) {
      outcomes.push(await fireT2hAttendees(p))
    }
  }

  return NextResponse.json({
    ok: true,
    inspected: polls.length,
    outcomes,
    timestamp: new Date().toISOString(),
  })
}

export async function GET(request: NextRequest) {
  return POST(request)
}
