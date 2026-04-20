// app/api/promotions/[id]/detail/route.ts
// Returns a promotion + its targets for the detail/preview page.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/app/lib/auth'
import { getPromotion, getPromotionTargets } from '@/app/lib/control-centre-db'

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

  const targets = await getPromotionTargets(params.id)
  return NextResponse.json({ promotion, targets })
}
