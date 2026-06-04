// app/api/dev/last-session/route.ts
// TEMPORARY read-only diagnostic (token-guarded) for "can't create a session"
// reports. Dumps the most recent rows across every creatable entity + the
// notifications_log (which records WhatsApp send failures with the error), so we
// can see what a coach last created and exactly why it appeared to fail.
//
//   GET /api/dev/last-session?token=…

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/app/lib/sql'

const DEBUG_TOKEN = 'mca-camp-dbg-7f3a91c2'

async function dump(q: Promise<{ rows: unknown[] }>): Promise<unknown> {
  try {
    const { rows } = await q
    return { ok: true, count: rows.length, rows }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('token') !== DEBUG_TOKEN) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const [series, fixtures, promotions, polls, notif, notifFailed] = await Promise.all([
    dump(sql`SELECT id, programme_id, series_type, title, recurrence_rule, series_start, default_time, created_at
             FROM schedule_series ORDER BY created_at DESC NULLS LAST LIMIT 5`),
    dump(sql`SELECT id, created_by, fixture_type, opposition, kickoff_at, created_at
             FROM fixtures ORDER BY created_at DESC NULLS LAST LIMIT 5`),
    dump(sql`SELECT id, created_by, promotion_type, title, status, send_mode, created_at
             FROM promotions ORDER BY created_at DESC NULLS LAST LIMIT 6`),
    dump(sql`SELECT id, created_by, question, status, promotion_id, created_at
             FROM polls ORDER BY created_at DESC NULLS LAST LIMIT 6`),
    dump(sql`SELECT event_type, programme_id, recipient_type, status, error, sent_at
             FROM notifications_log ORDER BY sent_at DESC NULLS LAST LIMIT 12`),
    dump(sql`SELECT event_type, programme_id, recipient_jid, status, error, sent_at
             FROM notifications_log WHERE status = 'failed' ORDER BY sent_at DESC NULLS LAST LIMIT 8`),
  ])

  return NextResponse.json({
    schedule_series: series,
    fixtures,
    promotions,
    polls,
    notifications_recent: notif,
    notifications_failed: notifFailed,
  })
}
