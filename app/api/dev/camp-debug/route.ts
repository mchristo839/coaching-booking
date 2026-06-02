// app/api/dev/camp-debug/route.ts
// TEMPORARY diagnostic — remove after debugging the camp LID/JID matching.
// Token-guarded read-only dump of recent camp_bookings so we can see how a
// stuck booking is keyed (lid vs phone, name, step) without DB access.

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/app/lib/sql'

const DEBUG_TOKEN = 'mca-camp-dbg-7f3a91c2'

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('token') !== DEBUG_TOKEN) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const { rows } = await sql`
    SELECT id, promotion_id, booking_group_id, parent_jid, parent_name,
           child_name, child_age, conversation_step, state, payment_status,
           created_at, updated_at
    FROM camp_bookings
    ORDER BY created_at DESC
    LIMIT 25
  `
  // Annotate JID form to make the lid-vs-phone split obvious at a glance.
  const annotated = rows.map((r) => ({
    ...r,
    jid_form: typeof r.parent_jid === 'string'
      ? (r.parent_jid.endsWith('@lid') ? 'lid' : r.parent_jid.endsWith('@g.us') ? 'group' : 'phone')
      : 'none',
  }))
  return NextResponse.json({ count: rows.length, bookings: annotated })
}
