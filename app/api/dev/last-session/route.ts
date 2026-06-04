// app/api/dev/last-session/route.ts
// TEMPORARY read-only diagnostic (token-guarded). Dumps recent promotions/polls
// WITH coach names, every programme's configured WhatsApp group id (to spot a
// bad/mistyped one), and the notifications_log (which records send failures with
// the error). Read-only.
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

  const [promotions, programmes, notif] = await Promise.all([
    dump(sql`
      SELECT pr.id, pr.promotion_type, pr.title, pr.status, pr.send_mode, pr.created_at,
             trim(coalesce(c.first_name,'')||' '||coalesce(c.last_name,'')) AS coach
      FROM promotions pr
      LEFT JOIN coaches_v2 c ON c.id = pr.created_by
      ORDER BY pr.created_at DESC NULLS LAST LIMIT 8`),
    dump(sql`
      SELECT p.id, p.programme_name, p.whatsapp_group_id, p.is_active,
             trim(coalesce(c.first_name,'')||' '||coalesce(c.last_name,'')) AS coach
      FROM programmes p
      LEFT JOIN coaches_v2 c ON c.id = p.coach_id
      ORDER BY p.programme_name`),
    dump(sql`
      SELECT n.event_type, n.status, n.error, n.recipient_jid, n.sent_at, p.programme_name
      FROM notifications_log n
      LEFT JOIN programmes p ON p.id = n.programme_id
      ORDER BY n.sent_at DESC NULLS LAST LIMIT 14`),
  ])

  return NextResponse.json({ promotions, programmes, notifications_recent: notif })
}
