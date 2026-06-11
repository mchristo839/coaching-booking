// app/api/dev/booking-check/route.ts
// TEMPORARY read-only diagnostic: shows recent camp bookings + their parent_jid
// type (phone vs @lid) so we can tell whether the 1:1 booking DM could actually
// reach the parent. Deleted again right after use.

import { NextResponse } from 'next/server'
import { sql } from '@/app/lib/sql'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const bookings = await sql.query(
      `SELECT id, promotion_id, parent_jid, parent_name, child_name, state, conversation_step, created_at
       FROM camp_bookings
       ORDER BY created_at DESC
       LIMIT 15`,
    )
    const annotated = bookings.rows.map((b) => ({
      ...b,
      jid_type: typeof b.parent_jid === 'string'
        ? (b.parent_jid.endsWith('@lid') ? 'LID (cannot DM)' : b.parent_jid.includes('@s.whatsapp.net') ? 'phone (DM-able)' : 'other')
        : 'none',
    }))
    return NextResponse.json({ bookings: annotated })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
