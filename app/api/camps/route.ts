// app/api/camps/route.ts
// Unified "Summer Camp" creator. ONE call that:
//   1. creates a holiday_camp promotion (days/prices/capacity + optional image),
//   2. creates a poll linked to that promotion (so YES triggers the booking chat),
//   3. posts the image (if any) + the poll to each target group.
//
// This is the single screen the coach uses — they never touch the separate
// Promotions/Polls builders for a camp.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/app/lib/auth'
import { getAuthorisedProgrammes, requireAuthorityOver, PermissionError } from '@/app/lib/permissions'
import { createPromotion, createPoll, getPollTargets, setPollTargetMessageId, logNotification } from '@/app/lib/control-centre-db'
import { sendWhatsAppPoll, sendWhatsAppMedia } from '@/app/lib/evolution'
import { randomBytes } from 'crypto'

function randomSlug(len = 16): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'
  const bytes = randomBytes(len)
  let out = ''
  for (let i = 0; i < len; i++) out += chars[bytes[i] & 31]
  return out
}

export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth || !auth.coachId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const {
      title, detail, venue, paymentLink, campDays, imageDataUrl,
      pollQuestion, pollOptions, yesOptionIndex, sendMode, programmeIds,
    } = body

    if (!detail || !String(detail).trim()) {
      return NextResponse.json({ error: 'A description is required' }, { status: 400 })
    }
    if (!paymentLink || !String(paymentLink).trim()) {
      return NextResponse.json({ error: 'A payment link is required' }, { status: 400 })
    }

    // Validate camp days.
    const cleanCampDays = (Array.isArray(campDays) ? campDays : [])
      .filter((d: { date?: string; price_gbp?: number | string }) => d && d.date && d.price_gbp !== '' && d.price_gbp != null)
      .map((d: { date: string; label?: string; price_gbp: number | string; capacity?: number | string | null }) => ({
        date: d.date,
        label: d.label || d.date,
        price_gbp: Number(d.price_gbp),
        capacity: d.capacity != null && d.capacity !== '' ? Number(d.capacity) : null,
      }))
      .filter((d: { price_gbp: number }) => !Number.isNaN(d.price_gbp))
    if (cleanCampDays.length === 0) {
      return NextResponse.json({ error: 'Add at least one camp day with a date and price' }, { status: 400 })
    }

    // Validate poll options.
    const cleanOptions = (Array.isArray(pollOptions) ? pollOptions : ['Yes please', 'No thanks', 'Maybe'])
      .map((o: string) => String(o).trim())
      .filter(Boolean)
    if (cleanOptions.length < 2) {
      return NextResponse.json({ error: 'The poll needs at least 2 options' }, { status: 400 })
    }
    const yesIdx = Math.max(0, Math.min(cleanOptions.length - 1, parseInt(String(yesOptionIndex ?? 0), 10) || 0))

    // Resolve target programmes.
    const authorised = await getAuthorisedProgrammes(auth.coachId)
    const resolvedProgrammeIds: string[] =
      sendMode === 'all_groups'
        ? authorised.map((p) => p.programme_id)
        : Array.isArray(programmeIds) ? programmeIds : []
    if (sendMode !== 'all_groups') {
      await requireAuthorityOver(auth.coachId, resolvedProgrammeIds)
    }
    if (resolvedProgrammeIds.length === 0) {
      return NextResponse.json({ error: 'Select at least one group to post to' }, { status: 400 })
    }

    // 1. The promotion (holds days/prices/capacity + image + payment link).
    const promotion = await createPromotion({
      createdBy: auth.coachId,
      promotionType: 'holiday_camp',
      title: title || null,
      detail: String(detail).trim(),
      venue: venue || null,
      paymentLink: String(paymentLink).trim(),
      sendMode: sendMode === 'all_groups' ? 'all_groups' : 'selected_groups',
      generatedMessage: String(detail).trim(),
      slug: randomSlug(),
      programmeIds: resolvedProgrammeIds,
      campDays: cleanCampDays,
      campImageUrl: typeof imageDataUrl === 'string' && imageDataUrl ? imageDataUrl : null,
    })

    // 2. The poll, linked to the promotion (YES → booking conversation).
    const poll = await createPoll({
      createdBy: auth.coachId,
      question: (pollQuestion && String(pollQuestion).trim()) || title || 'Holiday camp — interested?',
      options: cleanOptions,
      responseType: 'single',
      anonymous: false,
      programmeIds: resolvedProgrammeIds,
      yesOptionIndex: yesIdx,
      paymentLink: String(paymentLink).trim(),
      promotionId: promotion.id,
    })

    // 3. Post image (optional) + poll to each group.
    const targets = await getPollTargets(poll.id)
    let sent = 0
    let failed = 0
    for (const target of targets) {
      if (!target.whatsapp_group_id) { failed++; continue }
      try {
        if (promotion.camp_image_url) {
          try {
            await sendWhatsAppMedia(target.whatsapp_group_id, promotion.camp_image_url, String(detail).trim())
          } catch (e) {
            // Image is a nice-to-have — don't fail the whole post if it bounces.
            console.error('[CAMP] image send failed:', e)
          }
        }
        const { messageId } = await sendWhatsAppPoll(target.whatsapp_group_id, poll.question, cleanOptions, 1)
        if (messageId) await setPollTargetMessageId(poll.id, target.programme_id, messageId)
        await logNotification({
          eventType: 'camp_poll_sent', triggerUser: auth.coachId, programmeId: target.programme_id,
          recipientType: 'group', recipientJid: target.whatsapp_group_id, status: 'sent',
        })
        sent++
      } catch (err) {
        await logNotification({
          eventType: 'camp_poll_sent', triggerUser: auth.coachId, programmeId: target.programme_id,
          recipientType: 'group', recipientJid: target.whatsapp_group_id, status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        })
        failed++
      }
    }

    return NextResponse.json({ promotion, poll, sent, failed })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('[CAMPS POST] error:', error)
    return NextResponse.json({ error: 'Failed to create camp' }, { status: 500 })
  }
}
