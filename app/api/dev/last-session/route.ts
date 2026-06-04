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

  const [promotions, programmes, notif, votes, convos] = await Promise.all([
    dump(sql`
      SELECT pr.id, pr.promotion_type, pr.title, pr.status, pr.created_at,
             trim(coalesce(c.first_name,'')||' '||coalesce(c.last_name,'')) AS coach
      FROM promotions pr LEFT JOIN coaches_v2 c ON c.id = pr.created_by
      ORDER BY pr.created_at DESC NULLS LAST LIMIT 6`),
    dump(sql`SELECT p.id, p.programme_name, p.whatsapp_group_id FROM programmes p ORDER BY p.programme_name`),
    dump(sql`
      SELECT n.event_type, n.status, n.error, n.recipient_jid, n.sent_at, p.programme_name
      FROM notifications_log n LEFT JOIN programmes p ON p.id = n.programme_id
      ORDER BY n.sent_at DESC NULLS LAST LIMIT 12`),
    dump(sql`
      SELECT pr.created_at, pr.sender_name, pr.sender_jid, pr.chosen_option, po.question, p.programme_name
      FROM poll_responses pr
      LEFT JOIN polls po ON po.id = pr.poll_id
      LEFT JOIN programmes p ON p.id = pr.programme_id
      ORDER BY pr.created_at DESC NULLS LAST LIMIT 20`),
    dump(sql`
      SELECT created_at, sender_name, category, escalated,
             left(message_text, 90) AS message_text, left(bot_response, 120) AS bot_response
      FROM conversations
      ORDER BY created_at DESC NULLS LAST LIMIT 25`),
  ])

  return NextResponse.json({ promotions, programmes, notifications_recent: notif, poll_votes: votes, conversations: convos })
}
