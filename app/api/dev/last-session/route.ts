// app/api/dev/last-session/route.ts
// TEMPORARY read-only diagnostic (token-guarded) for "can't create a session"
// reports. Dumps the most recently created rows across the session-ish tables
// (schedule_series, pt_sessions, fixtures) with all columns, plus a count, so we
// can see what a coach last created and spot a bad/empty field. Read-only.
//
//   GET /api/dev/last-session?token=…

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/app/lib/sql'

const DEBUG_TOKEN = 'mca-camp-dbg-7f3a91c2'

async function dump(label: string, q: Promise<{ rows: unknown[] }>): Promise<unknown> {
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

  const [series, ptSessions, fixtures, exceptions] = await Promise.all([
    dump('schedule_series', sql`SELECT * FROM schedule_series ORDER BY created_at DESC NULLS LAST LIMIT 8`),
    dump('pt_sessions', sql`SELECT * FROM pt_sessions ORDER BY created_at DESC NULLS LAST LIMIT 8`),
    dump('fixtures', sql`SELECT * FROM fixtures ORDER BY created_at DESC NULLS LAST LIMIT 8`),
    dump('schedule_exceptions', sql`SELECT * FROM schedule_exceptions ORDER BY created_at DESC NULLS LAST LIMIT 8`),
  ])

  return NextResponse.json({ schedule_series: series, pt_sessions: ptSessions, fixtures, schedule_exceptions: exceptions })
}
