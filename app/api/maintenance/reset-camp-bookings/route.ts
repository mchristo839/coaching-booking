// app/api/maintenance/reset-camp-bookings/route.ts
// Ops helper to reset IN-PROGRESS holiday-camp bookings so a parent can start
// fresh (e.g. after the duplicate-camp-choice incident). Bearer-token guarded.
//
//   GET  → read-only inventory of every non-terminal booking (who's mid-flow,
//          at which step, on which camp). Use this to decide what to clear.
//   POST → clears matching bookings (sets state + step to 'cancelled'). Defaults
//          to a DRY RUN; pass {"dryRun": false} to actually clear.
//
// Safety rails (cannot be overridden):
//   • Never touches confirmed / cancelled / expired bookings.
//   • Never clears 'awaiting_coach_confirm' (parent has PAID, awaiting coach).
//   • 'awaiting_payment' (link sent, not yet paid) is only included when
//     scope='pre_paid'.
//   • A non-dry-run clear MUST be scoped (programmeId, promotionIds, or explicit
//     bookingIds) — it refuses to clear across every programme at once.

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/app/lib/sql'

function isAuthorised(request: NextRequest): boolean {
  const secret = process.env.HEALTH_CHECK_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

// Pre-payment collection/selection steps — safe to clear (no money involved yet).
const PRE_PAYMENT_STEPS = [
  'awaiting_dm_start',
  'awaiting_camp_selection',
  'awaiting_parent_name',
  'awaiting_child_name',
  'awaiting_child_age',
  'awaiting_day_selection',
  'awaiting_waitlist_confirm',
  'awaiting_checkout_confirm',
  'awaiting_payment_ready',
  'awaiting_remind_consent',
  'snoozed',
  'awaiting_reminder_response',
  'awaiting_reg_name',
  'awaiting_reg_email',
  'awaiting_reg_phone',
]
// 'pre_paid' also clears people who were SENT a payment link but haven't paid.
const PRE_PAID_STEPS = [...PRE_PAYMENT_STEPS, 'awaiting_payment']

const COLS = `
  cb.id, cb.parent_name, cb.child_name, cb.parent_jid, cb.conversation_step,
  cb.state, cb.payment_status, cb.programme_id, cb.promotion_id,
  cb.created_at::text AS created_at, cb.updated_at::text AS updated_at,
  p.title AS camp_title
`

export async function GET(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }
  const { rows } = await sql.query(
    `SELECT ${COLS}
       FROM camp_bookings cb
       LEFT JOIN promotions p ON p.id = cb.promotion_id
      WHERE cb.state NOT IN ('confirmed','cancelled','expired')
      ORDER BY cb.programme_id, cb.conversation_step, cb.created_at`
  )
  const byStep: Record<string, number> = {}
  const byCamp: Record<string, number> = {}
  for (const r of rows) {
    const step = (r.conversation_step as string) || 'null'
    byStep[step] = (byStep[step] || 0) + 1
    const camp = `${(r.camp_title as string) || '(no title)'} [${(r.programme_id as string) || 'no-programme'}]`
    byCamp[camp] = (byCamp[camp] || 0) + 1
  }
  return NextResponse.json({ total: rows.length, byStep, byCamp, bookings: rows })
}

export async function POST(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const dryRun = body.dryRun !== false // default: dry run
  const scope = body.scope === 'pre_paid' ? 'pre_paid' : 'pre_payment'
  const steps = scope === 'pre_paid' ? PRE_PAID_STEPS : PRE_PAYMENT_STEPS
  const programmeId = typeof body.programmeId === 'string' ? body.programmeId : null
  const promotionIds = Array.isArray(body.promotionIds) ? (body.promotionIds as string[]) : null
  const bookingIds = Array.isArray(body.bookingIds) ? (body.bookingIds as string[]) : null

  if (!dryRun && !programmeId && !promotionIds && !bookingIds) {
    return NextResponse.json(
      { error: 'Refusing to clear across all programmes. Pass programmeId, promotionIds, or bookingIds.' },
      { status: 400 }
    )
  }

  let rows
  if (bookingIds) {
    // Surgical: explicit ids, still guarded against confirmed/paid.
    rows = (
      await sql.query(
        `SELECT ${COLS}
           FROM camp_bookings cb
           LEFT JOIN promotions p ON p.id = cb.promotion_id
          WHERE cb.id = ANY($1::uuid[])
            AND cb.state NOT IN ('confirmed','cancelled','expired')
            AND cb.conversation_step <> 'awaiting_coach_confirm'`,
        [bookingIds]
      )
    ).rows
  } else {
    const params: unknown[] = [steps]
    let where = `cb.conversation_step = ANY($1::text[]) AND cb.state NOT IN ('confirmed','cancelled','expired')`
    if (programmeId) {
      params.push(programmeId)
      where += ` AND cb.programme_id = $${params.length}`
    }
    if (promotionIds) {
      params.push(promotionIds)
      where += ` AND cb.promotion_id = ANY($${params.length}::uuid[])`
    }
    rows = (
      await sql.query(
        `SELECT ${COLS}
           FROM camp_bookings cb
           LEFT JOIN promotions p ON p.id = cb.promotion_id
          WHERE ${where}`,
        params
      )
    ).rows
  }

  if (dryRun) {
    return NextResponse.json({ dryRun: true, scope, wouldClear: rows.length, bookings: rows })
  }

  const ids = rows.map((r) => r.id as string)
  if (ids.length === 0) {
    return NextResponse.json({ dryRun: false, cleared: 0, bookings: [] })
  }
  await sql.query(
    `UPDATE camp_bookings
        SET state = 'cancelled', conversation_step = 'cancelled', updated_at = NOW()
      WHERE id = ANY($1::uuid[])`,
    [ids]
  )
  console.log(`[RESET-CAMP-BOOKINGS] cleared ${ids.length} in-flight booking(s); scope=${scope}`)
  return NextResponse.json({ dryRun: false, scope, cleared: ids.length, bookings: rows })
}
