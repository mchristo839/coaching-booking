// app/api/maintenance/set-camp-payment/route.ts
// Ops helper to set/update a holiday-camp promotion's payment_link — the
// field the bot sends to parents at the "ready to pay" step. Accepts either
// a URL (Monzo.me/Revolut/PayPal — buildCampPaymentMessage renders "Here's
// your payment link:") or free-text bank transfer details (renders "Here's
// how to pay:"). Bearer-token guarded. Defaults to a DRY RUN.
//
//   POST { promotionIds: string[], paymentLink: string, dryRun?: boolean }
//     dryRun (default true) → returns the promotions that WOULD be updated,
//       with their current payment_link, so you can sanity-check before
//       real money instructions go out to parents.
//     dryRun:false          → sets payment_link on those promotions.
//
// Does not touch bookings already at/past the payment step — their
// payment_link is snapshotted onto camp_bookings.payment_link when the
// message is sent (see setStepForGroup in camp-booking.ts), so an in-flight
// booking keeps whatever it was already shown. This only changes what NEW
// "ready to pay" messages will contain.

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
  const paymentLink = typeof body.paymentLink === 'string' ? body.paymentLink.trim() : null
  const dryRun = body.dryRun !== false

  if (!promotionIds || promotionIds.length === 0) {
    return NextResponse.json({ error: 'Required: promotionIds[].' }, { status: 400 })
  }
  if (!paymentLink) {
    return NextResponse.json({ error: 'Required: paymentLink (non-empty string).' }, { status: 400 })
  }

  const rows = (
    await sql.query(
      `SELECT id, title, payment_link AS current_payment_link
         FROM promotions WHERE id = ANY($1::uuid[])`,
      [promotionIds]
    )
  ).rows

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      newPaymentLink: paymentLink,
      wouldUpdate: rows.map((r) => ({ id: r.id, title: r.title, current_payment_link: r.current_payment_link })),
    })
  }

  const { rowCount } = await sql.query(
    `UPDATE promotions SET payment_link = $2 WHERE id = ANY($1::uuid[])`,
    [promotionIds, paymentLink]
  )
  console.log(`[SET-CAMP-PAYMENT] updated ${rowCount} promotion(s)`)
  return NextResponse.json({
    dryRun: false,
    updated: rowCount,
    promotions: rows.map((r) => ({ id: r.id, title: r.title })),
  })
}
