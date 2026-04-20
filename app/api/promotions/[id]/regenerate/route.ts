// app/api/promotions/[id]/regenerate/route.ts
// Regenerate the AI message for an existing draft promotion.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/app/lib/auth'
import { getPromotion, getPromotionTargets, updatePromotionMessage } from '@/app/lib/control-centre-db'
import { generatePromotionMessage } from '@/app/lib/ai-messages'
import { sql } from '@vercel/postgres'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthFromRequest(request)
  if (!auth || !auth.coachId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const promotion = await getPromotion(params.id)
    if (!promotion) {
      return NextResponse.json({ error: 'Promotion not found' }, { status: 404 })
    }
    if (promotion.created_by !== auth.coachId) {
      return NextResponse.json({ error: 'Not the creator' }, { status: 403 })
    }
    if (promotion.status !== 'draft') {
      return NextResponse.json(
        { error: 'Cannot regenerate — promotion already sent' },
        { status: 400 }
      )
    }

    const targets = await getPromotionTargets(params.id)
    const firstProgrammeName = targets[0]?.programme_name || 'the programme'

    const { rows: coachRows } = await sql`
      SELECT first_name, last_name FROM coaches_v2 WHERE id = ${auth.coachId} LIMIT 1
    `
    const coachName = coachRows[0]
      ? `${coachRows[0].first_name} ${coachRows[0].last_name}`.trim()
      : 'Coach'

    const message = await generatePromotionMessage({
      promotionType: promotion.promotion_type,
      title: promotion.title,
      detail: promotion.detail,
      startAt: promotion.start_at,
      endAt: promotion.end_at,
      venue: promotion.venue,
      costGbp: promotion.cost_gbp != null ? Number(promotion.cost_gbp) : null,
      isFree: !!promotion.is_free,
      paymentLink: promotion.payment_link,
      coachName,
      programmeName: firstProgrammeName,
      referralLink:
        promotion.promotion_type === 'refer_a_friend' && promotion.slug
          ? `${process.env.NEXT_PUBLIC_APP_URL || 'https://coaching-booking-v3.vercel.app'}/refer/${promotion.slug}`
          : null,
    })

    await updatePromotionMessage(params.id, message)

    return NextResponse.json({ message })
  } catch (error) {
    console.error('[PROMOTIONS REGENERATE] error:', error)
    return NextResponse.json({ error: 'Failed to regenerate message' }, { status: 500 })
  }
}
