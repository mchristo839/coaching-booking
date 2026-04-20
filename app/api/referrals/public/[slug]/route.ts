// app/api/referrals/[slug]/route.ts
// Public endpoint: loads a referral promotion by slug and accepts submissions.
// No auth — anyone with the link can submit.

import { NextRequest, NextResponse } from 'next/server'
import { getPromotionBySlug, createReferral, getPromotionTargets } from '@/app/lib/control-centre-db'

export async function GET(
  _request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const promotion = await getPromotionBySlug(params.slug)
  if (!promotion || promotion.promotion_type !== 'refer_a_friend') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Only return safe public fields
  return NextResponse.json({
    title: promotion.title,
    detail: promotion.detail,
    venue: promotion.venue,
    startAt: promotion.start_at,
    isFree: promotion.is_free,
    status: promotion.status,
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const body = await request.json()
    const { friendFirstName, childName, friendEmail, friendPhone, referredByName } = body

    if (!friendFirstName || !friendPhone) {
      return NextResponse.json(
        { error: 'Your name and phone number are required' },
        { status: 400 }
      )
    }

    const promotion = await getPromotionBySlug(params.slug)
    if (!promotion || promotion.promotion_type !== 'refer_a_friend') {
      return NextResponse.json({ error: 'Referral not found' }, { status: 404 })
    }
    if (promotion.status !== 'sent' && promotion.status !== 'draft') {
      return NextResponse.json({ error: 'This referral is no longer active' }, { status: 400 })
    }

    // Use the first linked programme as the referral's programme
    const targets = await getPromotionTargets(promotion.id)
    if (targets.length === 0) {
      return NextResponse.json({ error: 'No programme linked' }, { status: 400 })
    }

    const referral = await createReferral({
      promotionId: promotion.id,
      programmeId: targets[0].programme_id,
      friendFirstName: String(friendFirstName).trim(),
      childName: childName ? String(childName).trim() : null,
      friendEmail: friendEmail ? String(friendEmail).trim() : null,
      friendPhone: String(friendPhone).trim(),
      referredByName: referredByName ? String(referredByName).trim() : null,
    })

    return NextResponse.json({ success: true, referralId: referral.id })
  } catch (error) {
    console.error('[REFERRALS POST] error:', error)
    return NextResponse.json({ error: 'Failed to submit referral' }, { status: 500 })
  }
}
