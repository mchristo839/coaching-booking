// app/api/promotions/[id]/bookings/route.ts
// GET: list every camp_bookings row for this promotion, for the
// reconciliation dashboard.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/app/lib/auth'
import { getPromotion } from '@/app/lib/control-centre-db'
import { listCampBookingsForPromotion } from '@/app/lib/camp-booking'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthFromRequest(request)
  if (!auth || !auth.coachId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const promotion = await getPromotion(params.id)
  if (!promotion) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (promotion.created_by !== auth.coachId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const bookings = await listCampBookingsForPromotion(params.id)
  return NextResponse.json({ bookings, camp_days: promotion.camp_days || [] })
}
