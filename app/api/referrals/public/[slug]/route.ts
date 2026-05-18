// app/api/referrals/[slug]/route.ts
// Public endpoint: loads a referral promotion by slug and accepts submissions.
// No auth — anyone with the link can submit.

import { NextRequest, NextResponse } from 'next/server'
import {
  getPromotionBySlug,
  createReferral,
  getPromotionTargets,
  getReferralContext,
  setReferralFirstSession,
  logNotification,
  getMemberForProgramme,
} from '@/app/lib/control-centre-db'
import { generateReferralConfirmation } from '@/app/lib/ai-messages'
import { sendWhatsAppMessage } from '@/app/lib/evolution'

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
    const {
      friendFirstName,
      childName,
      friendEmail,
      friendPhone,
      referredByName,
      referrerMemberId,
    } = body

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
    const programmeId = targets[0].programme_id

    // Resolve the referrer member if one was picked from the dropdown.
    // Verify the member genuinely belongs to this programme — otherwise
    // ignore the input (defence against arbitrary UUID injection from the
    // form) and fall through to the free-text fallback.
    let resolvedMemberId: string | null = null
    let resolvedMemberName: string | null = null
    if (referrerMemberId && typeof referrerMemberId === 'string') {
      const member = await getMemberForProgramme(referrerMemberId, programmeId)
      if (member) {
        resolvedMemberId = member.id
        resolvedMemberName = member.parent_name || null
      }
    }

    // Store the human-readable name for backwards compat with existing
    // notification logic. Prefer the resolved member's name when we have
    // one (authoritative) over the typed free-text.
    const storedReferredByName =
      resolvedMemberName ||
      (referredByName ? String(referredByName).trim() : null)

    const referral = await createReferral({
      promotionId: promotion.id,
      programmeId,
      friendFirstName: String(friendFirstName).trim(),
      childName: childName ? String(childName).trim() : null,
      friendEmail: friendEmail ? String(friendEmail).trim() : null,
      friendPhone: String(friendPhone).trim(),
      referredByName: storedReferredByName,
      referrerMemberId: resolvedMemberId,
    })

    // Seed first_session_at from the promotion's start_at if set
    if (promotion.start_at) {
      await setReferralFirstSession(referral.id, promotion.start_at)
    }

    // Send WhatsApp confirmation to the friend (fire-and-forget)
    try {
      const ctx = await getReferralContext(referral.id)
      if (ctx) {
        const phone = String(friendPhone).trim().replace(/\D/g, '')
        if (phone) {
          const jid = `${phone}@s.whatsapp.net`
          const coachName = `${ctx.coach_first_name} ${ctx.coach_last_name}`.trim()
          const message = await generateReferralConfirmation({
            friendFirstName: ctx.friend_first_name,
            childName: ctx.child_name,
            programmeName: ctx.programme_name,
            coachName,
            venue: ctx.venue_name,
            firstSessionAt: ctx.first_session_at,
            referredByName: ctx.referred_by_name,
          })
          try {
            await sendWhatsAppMessage(jid, message)
            await logNotification({
              eventType: 'referral_confirmation',
              programmeId: ctx.programme_id,
              recipientType: 'parent',
              recipientJid: jid,
              status: 'sent',
            })
          } catch (sendErr) {
            await logNotification({
              eventType: 'referral_confirmation',
              programmeId: ctx.programme_id,
              recipientType: 'parent',
              recipientJid: jid,
              status: 'failed',
              error: sendErr instanceof Error ? sendErr.message : String(sendErr),
            })
          }
        }
      }
    } catch (confirmErr) {
      console.error('[REFERRALS confirmation] error:', confirmErr)
      // Don't fail the submission if confirmation fails
    }

    return NextResponse.json({ success: true, referralId: referral.id })
  } catch (error) {
    console.error('[REFERRALS POST] error:', error)
    return NextResponse.json({ error: 'Failed to submit referral' }, { status: 500 })
  }
}
