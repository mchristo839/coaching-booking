// app/api/dev/camp-debug/route.ts
// TEMPORARY diagnostic — remove after debugging camp matching + coach handoff.
// Token-guarded, read-only.

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/app/lib/sql'

const DEBUG_TOKEN = 'mca-camp-dbg-7f3a91c2'

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('token') !== DEBUG_TOKEN) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const camp = await sql`
    SELECT id, parent_jid, parent_name, child_name, child_age, conversation_step, state, created_at
    FROM camp_bookings ORDER BY created_at DESC LIMIT 25
  `
  // Why are coach handoff DMs not arriving? Show the logged sends + the coaches'
  // mobile numbers (the DM target is derived from coaches_v2.mobile).
  const handoff = await sql`
    SELECT event_type, recipient_type, recipient_jid, status, error, created_at
    FROM notifications_log
    WHERE event_type LIKE 'bot_handoff%'
    ORDER BY created_at DESC LIMIT 20
  `
  const coaches = await sql`
    SELECT c.id, c.first_name, c.last_name, c.mobile,
           (SELECT COUNT(*) FROM programmes p WHERE p.coach_id = c.id) AS programmes
    FROM coaches_v2 c ORDER BY c.created_at DESC LIMIT 20
  `

  const annotate = (r: Record<string, unknown>) => ({
    ...r,
    jid_form: typeof r.parent_jid === 'string'
      ? (r.parent_jid.endsWith('@lid') ? 'lid' : r.parent_jid.endsWith('@g.us') ? 'group' : 'phone')
      : 'none',
  })

  return NextResponse.json({
    camp_bookings: camp.rows.map(annotate),
    handoff_log: handoff.rows,
    coaches: coaches.rows.map((c) => ({
      ...c,
      mobile_ok: typeof c.mobile === 'string' && c.mobile.replace(/\D/g, '').length >= 10,
    })),
  })
}
