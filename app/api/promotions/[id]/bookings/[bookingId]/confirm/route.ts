// app/api/promotions/[id]/bookings/[bookingId]/confirm/route.ts
// Coach action: mark a self-reported booking as bank-confirmed.
// (Coach has reconciled with their actual bank/Monzo alert.)

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/app/lib/sql'
import { getAuthFromRequest } from '@/app/lib/auth'
import { getPromotion } from '@/app/lib/control-centre-db'
import { confirmCampBookingPayment } from '@/app/lib/camp-booking'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; bookingId: string } }
) {
  const auth = await getAuthFromRequest(request)
  if (!auth || !auth.coachId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const promotion = await getPromotion(params.id)
  if (!promotion) {
    return NextResponse.json({ error: 'Promotion not found' }, { status: 404 })
  }
  if (promotion.created_by !== auth.coachId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Verify the booking belongs to this promotion before mutating.
  const { rows } = await sql`
    SELECT id, state FROM camp_bookings
    WHERE id = ${params.bookingId} AND promotion_id = ${params.id}
    LIMIT 1
  `
  const booking = rows[0]
  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  await confirmCampBookingPayment(params.bookingId, auth.coachId)
  return NextResponse.json({ ok: true })
}
