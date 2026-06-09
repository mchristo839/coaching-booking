// app/api/dev/migrate-kb/route.ts
//
// TEMPORARY one-off helper: mirror selected KB fields onto a target programme so
// the Demo/dummy group answers identically to the live one for testing. Guarded
// by the ops bearer secret OR the (already-public) bot-test debug token. Deleted
// again immediately after use.

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/app/lib/sql'

export const dynamic = 'force-dynamic'

const V2_KB_COLUMNS = [
  'venue_name', 'venue_address', 'specific_age_group', 'target_audience', 'skill_level',
  'session_days', 'session_start_time', 'session_duration', 'session_schedule',
  'price_gbp', 'paid_or_free', 'payment_method', 'payment_methods',
  'session_type', 'camp_schedule', 'what_to_bring', 'cancellation_notice',
  'short_description', 'bot_notes',
]

export async function POST(request: NextRequest) {
  const secret = process.env.HEALTH_CHECK_SECRET
  const bearerOk = !!secret && request.headers.get('authorization') === `Bearer ${secret}`
  const tokenOk = request.nextUrl.searchParams.get('token') === 'mca-camp-dbg-7f3a91c2'
  if (!bearerOk && !tokenOk) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  try {
    const body = await request.json()
    const targetId = String(body.targetId || '')
    const dryRun = body.dryRun !== false
    const setObj = (body.set && typeof body.set === 'object') ? body.set as Record<string, unknown> : null
    if (!targetId || !setObj) return NextResponse.json({ error: 'targetId and set are required' }, { status: 400 })

    const tgt = await sql.query(`SELECT * FROM programmes WHERE id = $1`, [targetId])
    if (tgt.rows.length === 0) return NextResponse.json({ error: 'target not found' }, { status: 404 })
    const target = tgt.rows[0]

    const cols = Object.keys(setObj).filter((c) => V2_KB_COLUMNS.includes(c))
    const rejected = Object.keys(setObj).filter((c) => !V2_KB_COLUMNS.includes(c))
    const changes: Record<string, { from: unknown; to: unknown }> = {}
    for (const c of cols) changes[c] = { from: target[c], to: setObj[c] }

    if (dryRun) {
      return NextResponse.json({ dryRun: true, targetId, changes, rejectedColumns: rejected, note: 'Nothing written. Re-POST with "dryRun": false to apply.' })
    }
    if (cols.length > 0) {
      const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(', ')
      await sql.query(`UPDATE programmes SET ${sets}, updated_at = NOW() WHERE id = $${cols.length + 1}`, [...cols.map((c) => setObj[c]), targetId])
    }
    return NextResponse.json({ applied: true, targetId, updatedColumns: cols, rejectedColumns: rejected })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
