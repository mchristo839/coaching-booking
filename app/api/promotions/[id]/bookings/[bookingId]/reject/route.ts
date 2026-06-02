// app/api/promotions/[id]/bookings/[bookingId]/reject/route.ts
// Coach action: reject a self-reported payment (wrong amount / not received).
// The booking stays at awaiting_confirmation; the parent is messaged that the
// coach will be in touch. Mirror of the confirm route.

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/app/lib/sql'
import { getAuthFromRequest } from '@/app/lib/auth'
import { getPromotion } from '@/app/lib/control-centre-db'
import { rejectCampBooking } from '@/app/lib/camp-booking'

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

  const { rows } = await sql`
    SELECT id FROM camp_bookings
    WHERE id = ${params.bookingId} AND promotion_id = ${params.id}
    LIMIT 1
  `
  if (!rows[0]) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  await rejectCampBooking(params.bookingId, auth.coachId)
  return NextResponse.json({ ok: true })
}
