// app/api/maintenance/cancel-camps/route.ts
// Ops helper to cancel (archive) holiday-camp promotions by id — used to clear
// out stale/test/duplicate camps so the booking "which camp?" choice only ever
// shows real, current camps. Bearer-token guarded. Defaults to a DRY RUN.
//
//   POST { promotionIds: string[], dryRun?: boolean }
//     dryRun (default true) → returns the camps that WOULD be cancelled.
//     dryRun:false          → sets status = 'cancelled' on those promotions.
//
// Cancelling a promotion removes it from getActiveCampsForProgramme (which
// filters status <> 'cancelled'); it does NOT delete the row, and any existing
// booking that references it still loads by id, so this is safe + reversible.

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/app/lib/sql'

function isAuthorised(request: NextRequest): boolean {
  const secret = process.env.HEALTH_CHECK_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function POST(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const promotionIds = Array.isArray(body.promotionIds) ? (body.promotionIds as string[]) : null
  const dryRun = body.dryRun !== false

  if (!promotionIds || promotionIds.length === 0) {
    return NextResponse.json({ error: 'Required: promotionIds[].' }, { status: 400 })
  }

  const rows = (
    await sql.query(
      `SELECT id, title, status, camp_days FROM promotions WHERE id = ANY($1::uuid[])`,
      [promotionIds]
    )
  ).rows

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      wouldCancel: rows.map((r) => ({ id: r.id, title: r.title, status: r.status })),
    })
  }

  const { rowCount } = await sql.query(
    `UPDATE promotions SET status = 'cancelled' WHERE id = ANY($1::uuid[]) AND status <> 'cancelled'`,
    [promotionIds]
  )
  console.log(`[CANCEL-CAMPS] cancelled ${rowCount} promotion(s)`)
  return NextResponse.json({
    dryRun: false,
    cancelled: rowCount,
    promotions: rows.map((r) => ({ id: r.id, title: r.title })),
  })
}
