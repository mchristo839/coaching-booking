// app/api/promotions/[id]/send/route.ts
// Send a promotion's generated message to all its targets via WhatsApp.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/app/lib/auth'
import {
  getPromotion,
  getPromotionTargets,
  markPromotionTargetSent,
  markPromotionTargetFailed,
  finalisePromotion,
  logNotification,
} from '@/app/lib/control-centre-db'
import { sendWhatsAppMessage } from '@/app/lib/evolution'
import { requireAuthorityOver, PermissionError } from '@/app/lib/permissions'

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
        { error: `Promotion already ${promotion.status}` },
        { status: 400 }
      )
    }

    const targets = await getPromotionTargets(params.id)
    const targetProgrammeIds = targets.map((t) => t.programme_id)

    // Re-check permissions at send time
    await requireAuthorityOver(auth.coachId, targetProgrammeIds)

    if (!promotion.generated_message) {
      return NextResponse.json(
        { error: 'Promotion has no generated message' },
        { status: 400 }
      )
    }

    let sentCount = 0
    let failedCount = 0

    for (const target of targets) {
      if (!target.whatsapp_group_id) {
        await markPromotionTargetFailed(target.id, 'No WhatsApp group linked')
        await logNotification({
          eventType: 'promotion_sent',
          triggerUser: auth.coachId,
          programmeId: target.programme_id,
          recipientType: 'group',
          status: 'failed',
          error: 'No WhatsApp group linked',
        })
        failedCount++
        continue
      }

      try {
        await sendWhatsAppMessage(target.whatsapp_group_id, promotion.generated_message)
        await markPromotionTargetSent(target.id)
        await logNotification({
          eventType: 'promotion_sent',
          triggerUser: auth.coachId,
          programmeId: target.programme_id,
          recipientType: 'group',
          recipientJid: target.whatsapp_group_id,
          status: 'sent',
        })
        sentCount++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await markPromotionTargetFailed(target.id, msg)
        await logNotification({
          eventType: 'promotion_sent',
          triggerUser: auth.coachId,
          programmeId: target.programme_id,
          recipientType: 'group',
          recipientJid: target.whatsapp_group_id,
          status: 'failed',
          error: msg,
        })
        failedCount++
      }
    }

    const finalStatus = failedCount > 0 ? 'partial_failure' : 'sent'
    await finalisePromotion(params.id, finalStatus)

    return NextResponse.json({
      success: true,
      sent: sentCount,
      failed: failedCount,
      status: finalStatus,
    })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('[PROMOTIONS SEND] error:', error)
    return NextResponse.json({ error: 'Failed to send promotion' }, { status: 500 })
  }
}
