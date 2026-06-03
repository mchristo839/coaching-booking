// app/api/dev/camp-debug/route.ts
// TEMPORARY diagnostic — remove after debugging camp matching + coach handoff.
// Token-guarded, read-only. Each query is isolated so one failure can't blank
// the whole response.

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/app/lib/sql'

const DEBUG_TOKEN = 'mca-camp-dbg-7f3a91c2'

async function safe<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try { return await fn() } catch (e) { return { error: e instanceof Error ? e.message : String(e) } }
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('token') !== DEBUG_TOKEN) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const camp = await safe(async () => {
    const { rows } = await sql`
      SELECT id, parent_jid, parent_name, child_name, child_age, conversation_step, state, created_at
      FROM camp_bookings ORDER BY created_at DESC LIMIT 25`
    return rows.map((r) => ({
      ...r,
      jid_form: typeof r.parent_jid === 'string'
        ? (r.parent_jid.endsWith('@lid') ? 'lid' : r.parent_jid.endsWith('@g.us') ? 'group' : 'phone') : 'none',
    }))
  })

  const handoff = await safe(async () => {
    const { rows } = await sql`
      SELECT event_type, recipient_type, recipient_jid, status, error, sent_at
      FROM notifications_log
      WHERE event_type LIKE 'bot_handoff%'
      ORDER BY sent_at DESC LIMIT 25`
    return rows
  })

  const coaches = await safe(async () => {
    const { rows } = await sql`
      SELECT c.id, c.first_name, c.last_name, c.mobile,
             (SELECT COUNT(*) FROM programmes p WHERE p.coach_id = c.id) AS programmes
      FROM coaches_v2 c LIMIT 30`
    return rows.map((c) => ({
      ...c,
      mobile_digits: typeof c.mobile === 'string' ? c.mobile.replace(/\D/g, '') : '',
      mobile_ok: typeof c.mobile === 'string' && c.mobile.replace(/\D/g, '').length >= 10,
    }))
  })

  return NextResponse.json({ camp_bookings: camp, handoff_log: handoff, coaches })
}
