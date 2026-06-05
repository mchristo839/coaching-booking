// app/api/dev/last-session/route.ts
// TEMPORARY read-only diagnostic (token-guarded). Recent promotions/polls (with
// coach), programmes' group ids, notifications_log, AND poll votes + the
// conversation log — to verify a real launch: votes logged, bookings opened,
// questions answered. Read-only.
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

  const [programmes, faqs, convos] = await Promise.all([
    dump(sql`SELECT p.id, p.programme_name, p.whatsapp_group_id, p.camp_schedule, p.holiday_schedule, p.season_type
             FROM programmes p ORDER BY p.programme_name`),
    dump(sql`SELECT f.programme_id, f.question, f.answer, f.status, f.source, f.created_at, p.programme_name
             FROM faqs f LEFT JOIN programmes p ON p.id = f.programme_id
             WHERE f.status = 'active'
             ORDER BY f.created_at DESC NULLS LAST LIMIT 40`),
    dump(sql`
      SELECT created_at, sender_name, category, escalated,
             left(message_text, 90) AS message_text, left(bot_response, 160) AS bot_response
      FROM conversations
      ORDER BY created_at DESC NULLS LAST LIMIT 25`),
  ])

  return NextResponse.json({ programmes, active_faqs: faqs, conversations: convos })
}
