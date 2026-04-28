// app/api/cron/session-reminders/route.ts
// Day-before reminder cron. Designed to be hit once a day from Contabo.
// For every active schedule_series, finds the next scheduled instance that
// falls on the next London-day, and DMs the coach with a quick attendance
// summary from the latest poll on that programme.
//
// Auth: Bearer HEALTH_CHECK_SECRET (mirrors /api/health and the existing
// referral-nudges cron — same Contabo box, same secret).
//
// Idempotency: a notifications_log row tagged with event_type
// 'session_reminder' is keyed on (programme_id, sent_at::date). If a row for
// the same programme already exists today the reminder is skipped, so the
// cron is safe to re-run within a day.

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { expandSeries } from '@/app/lib/schedule'
import { getPollTally, logNotification } from '@/app/lib/control-centre-db'
import { generateSessionReminder } from '@/app/lib/ai-messages'
import { sendWhatsAppMessage } from '@/app/lib/evolution'

export const dynamic = 'force-dynamic'

function isAuthorised(request: NextRequest): boolean {
  const secret = (process.env.HEALTH_CHECK_SECRET || '').trim()
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

// Compute the YYYY-MM-DD date string for "tomorrow in Europe/London".
// We pick the time window 0:00 → 23:59 of that London-local date and then
// compare against `instance.date` (already YYYY-MM-DD in expandSeries).
function tomorrowLondonDate(): string {
  const now = new Date()
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  // Format as YYYY-MM-DD in Europe/London tz, regardless of the server's tz.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(tomorrow)
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const d = parts.find((p) => p.type === 'day')?.value
  return `${y}-${m}-${d}`
}

function formatStartsAtLocal(isoUtc: string): string {
  const d = new Date(isoUtc)
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

interface ReminderResult {
  programmeId: string
  programmeName: string
  status: 'sent' | 'skipped_dedup' | 'skipped_no_session' | 'skipped_no_coach_mobile' | 'failed'
  sessionDate?: string
  error?: string
}

export async function POST(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const targetDate = tomorrowLondonDate()
  const results: ReminderResult[] = []

  try {
    // All active programmes with at least one schedule_series row. Joining
    // on schedule_series filters out programmes without recurring sessions.
    const { rows: programmes } = await sql`
      SELECT DISTINCT p.id, p.programme_name, p.coach_id, p.whatsapp_group_id,
             c.first_name as coach_first_name, c.last_name as coach_last_name,
             c.mobile as coach_mobile
      FROM programmes p
      JOIN schedule_series s ON s.programme_id = p.id
      JOIN coaches_v2 c ON c.id = p.coach_id
      WHERE p.is_active = true
    `

    for (const prog of programmes) {
      try {
        // Idempotency check — has a session_reminder for this programme
        // already been logged in the last 23 hours? Coarse but matches a
        // daily cron well enough.
        const { rows: dup } = await sql`
          SELECT 1 FROM notifications_log
          WHERE event_type = 'session_reminder'
            AND programme_id = ${prog.id}
            AND sent_at > NOW() - INTERVAL '23 hours'
          LIMIT 1
        `
        if (dup.length > 0) {
          results.push({
            programmeId: prog.id,
            programmeName: prog.programme_name,
            status: 'skipped_dedup',
          })
          continue
        }

        // Expand all this programme's series across the next 48h and pick
        // the first instance whose date matches the target London-day and
        // is not cancelled.
        const fromDate = new Date()
        const toDate = new Date(Date.now() + 48 * 60 * 60 * 1000)

        const { rows: seriesRows } = await sql`
          SELECT id, programme_id, title, recurrence_rule,
                 series_start::text as series_start,
                 series_end::text as series_end,
                 default_time::text as default_time,
                 default_duration_mins, default_venue
          FROM schedule_series
          WHERE programme_id = ${prog.id}
        `

        let nextInstance = null
        for (const series of seriesRows) {
          const expanded = await expandSeries(series as never, fromDate, toDate)
          for (const inst of expanded) {
            if (inst.date === targetDate && inst.status !== 'cancelled') {
              nextInstance = inst
              break
            }
          }
          if (nextInstance) break
        }

        if (!nextInstance) {
          results.push({
            programmeId: prog.id,
            programmeName: prog.programme_name,
            status: 'skipped_no_session',
          })
          continue
        }

        if (!prog.coach_mobile || prog.coach_mobile === '') {
          results.push({
            programmeId: prog.id,
            programmeName: prog.programme_name,
            status: 'skipped_no_coach_mobile',
            sessionDate: nextInstance.date,
          })
          continue
        }

        // Latest active poll on this programme — used as the attendance
        // proxy. The schema doesn't link polls to specific sessions, so
        // most-recent active poll is the best signal we have.
        const { rows: pollRow } = await sql`
          SELECT p.id, p.question, p.options
          FROM polls p
          JOIN poll_targets pt ON pt.poll_id = p.id
          WHERE pt.programme_id = ${prog.id}
            AND p.status = 'active'
          ORDER BY p.created_at DESC
          LIMIT 1
        `
        const poll = pollRow[0] || null

        let attendance = { yes: 0, no: 0, maybe: 0, pending: 0, pollQuestion: null as string | null }
        if (poll) {
          const tally = await getPollTally(poll.id)
          // Map options to yes/no/maybe heuristically — it's a coach-written
          // poll so we match common phrasings rather than enforce a schema.
          for (const row of tally) {
            const label = String(row.chosen_option || '').toLowerCase()
            const count = parseInt(String(row.count), 10) || 0
            if (label.includes('yes') || label.includes('i can') || label.includes('attending')) {
              attendance.yes += count
            } else if (label.includes('no') || label.includes("can't") || label.includes('cant')) {
              attendance.no += count
            } else if (label.includes('maybe') || label.includes('not sure')) {
              attendance.maybe += count
            } else {
              attendance.yes += count // fall-through: unmapped options counted as 'yes'
            }
          }
          // 'pending' = members without a response. We don't have a members
          // table tally per programme yet; leave at 0 for now.
          attendance.pollQuestion = poll.question
        }

        // Build the AI message and send via WhatsApp DM (1-1) to the coach.
        const message = await generateSessionReminder({
          coachFirstName: prog.coach_first_name || 'Coach',
          programmeName: prog.programme_name,
          sessionTitle: nextInstance.title,
          startsAtLocal: formatStartsAtLocal(nextInstance.starts_at),
          venue: nextInstance.venue,
          attendance,
        })

        const coachJid = prog.coach_mobile.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
        await sendWhatsAppMessage(coachJid, message)

        await logNotification({
          eventType: 'session_reminder',
          triggerUser: prog.coach_id,
          programmeId: prog.id,
          recipientType: 'coach',
          recipientJid: coachJid,
          channel: 'whatsapp',
          status: 'sent',
        })

        results.push({
          programmeId: prog.id,
          programmeName: prog.programme_name,
          status: 'sent',
          sessionDate: nextInstance.date,
        })
      } catch (perProgError) {
        const errMsg = perProgError instanceof Error ? perProgError.message : String(perProgError)
        await logNotification({
          eventType: 'session_reminder',
          programmeId: prog.id,
          recipientType: 'coach',
          channel: 'whatsapp',
          status: 'failed',
          error: errMsg,
        }).catch(() => {})
        results.push({
          programmeId: prog.id,
          programmeName: prog.programme_name,
          status: 'failed',
          error: errMsg,
        })
      }
    }

    const sent = results.filter((r) => r.status === 'sent').length
    const failed = results.filter((r) => r.status === 'failed').length
    const skipped = results.length - sent - failed
    return NextResponse.json({ targetDate, sent, failed, skipped, results })
  } catch (error) {
    console.error('[CRON SESSION-REMINDERS] error:', error)
    return NextResponse.json(
      { error: 'Cron run failed', detail: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
