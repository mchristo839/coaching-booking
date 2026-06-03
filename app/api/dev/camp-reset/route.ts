// app/api/dev/camp-reset/route.ts
// TEMPORARY token-guarded maintenance during camp testing.
//   GET  ?token=… → dump recent camp_bookings (parent_jid form, step, name).
//   POST ?token=… → cancel all non-confirmed camp_bookings (clears stuck test
//                    rows so a fresh booking starts clean). Optional &jid=… to
//                    scope to one parent. Confirmed bookings are never touched.

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/app/lib/sql'

const DEBUG_TOKEN = 'mca-camp-dbg-7f3a91c2'

function annotate(rows: Record<string, unknown>[]) {
  return rows.map((r) => ({
    ...r,
    jid_form: typeof r.parent_jid === 'string'
      ? (r.parent_jid.endsWith('@lid') ? 'lid' : r.parent_jid.endsWith('@g.us') ? 'group' : 'phone') : 'none',
  }))
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('token') !== DEBUG_TOKEN) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const { rows } = await sql`
    SELECT id, parent_jid, parent_name, child_name, child_age, conversation_step, state,
           member_id, created_at
    FROM camp_bookings ORDER BY created_at DESC LIMIT 40`
  return NextResponse.json({ count: rows.length, bookings: annotate(rows) })
}

export async function POST(request: NextRequest) {
  if (request.nextUrl.searchParams.get('token') !== DEBUG_TOKEN) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const jid = request.nextUrl.searchParams.get('jid')
  const { rows } = jid
    ? await sql`
        UPDATE camp_bookings SET state = 'cancelled', conversation_step = 'cancelled', updated_at = NOW()
        WHERE parent_jid = ${jid} AND state <> 'confirmed' AND (conversation_step IS NULL OR conversation_step <> 'confirmed')
        RETURNING id`
    : await sql`
        UPDATE camp_bookings SET state = 'cancelled', conversation_step = 'cancelled', updated_at = NOW()
        WHERE state <> 'confirmed' AND (conversation_step IS NULL OR conversation_step <> 'confirmed')
        RETURNING id`
  return NextResponse.json({ cancelled: rows.length })
}
