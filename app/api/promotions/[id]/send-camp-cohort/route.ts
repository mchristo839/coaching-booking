// app/api/promotions/[id]/send-camp-cohort/route.ts
// Blast the holiday-camp 1:1 invite to every (parent, child) in the
// targeted programmes' member rolls. Creates one camp_bookings row per
// child in 'awaiting_day_selection' state, then sends the invite WhatsApp
// message. Idempotent — skips members who already have a camp_booking for
// this promotion. Re-runnable after adding more parents to the cohort.

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/app/lib/sql'
import { getAuthFromRequest } from '@/app/lib/auth'
import { getPromotion, getPromotionTargets } from '@/app/lib/control-centre-db'
import { requireAuthorityOver, PermissionError } from '@/app/lib/permissions'
import { listMembersByProgramme } from '@/app/lib/db'
import { normalizeUkPhoneToJid } from '@/app/lib/feedback'
import { createCampBooking, type CampDay } from '@/app/lib/camp-booking'
import { generateCampInviteMessage } from '@/app/lib/ai-messages'
import { sendWhatsAppMessage } from '@/app/lib/evolution'

interface SendResult {
  sent: number
  skipped: number
  failed: number
  details: Array<{
    memberId: string
    childName: string | null
    status: 'sent' | 'skipped_already_invited' | 'skipped_missing_data' | 'failed'
    error?: string
  }>
}

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
    if (promotion.promotion_type !== 'holiday_camp') {
      return NextResponse.json(
        { error: 'This endpoint is only for holiday_camp promotions' },
        { status: 400 }
      )
    }

    const campDays: CampDay[] = promotion.camp_days || []
    if (!Array.isArray(campDays) || campDays.length === 0) {
      return NextResponse.json(
        { error: 'Promotion has no camp_days configured' },
        { status: 400 }
      )
    }
    if (!promotion.payment_link) {
      return NextResponse.json(
        { error: 'Promotion has no payment_link configured' },
        { status: 400 }
      )
    }

    const targets = await getPromotionTargets(params.id)
    const targetProgrammeIds = targets.map((t) => t.programme_id)
    if (targetProgrammeIds.length === 0) {
      return NextResponse.json({ error: 'No target programmes' }, { status: 400 })
    }
    await requireAuthorityOver(auth.coachId, targetProgrammeIds)

    // Coach name for the AI prompt context.
    const { rows: coachRows } = await sql`
      SELECT first_name, last_name FROM coaches_v2 WHERE id = ${auth.coachId} LIMIT 1
    `
    const coachName = coachRows[0]
      ? `${coachRows[0].first_name} ${coachRows[0].last_name}`.trim()
      : 'Coach'

    const result: SendResult = { sent: 0, skipped: 0, failed: 0, details: [] }

    for (const programmeId of targetProgrammeIds) {
      const members = await listMembersByProgramme(programmeId)
      for (const member of members) {
        const parentName: string | null = member.parent_name || null
        const childName: string | null = member.child_name || null
        const rawContact: string =
          member.parent_whatsapp_id || member.parent_phone || ''

        // Need at least a child name + a contact to send. Skip the rest with
        // a note so the coach can fix them in the cohort.
        if (!childName || !rawContact) {
          result.skipped++
          result.details.push({
            memberId: member.id,
            childName,
            status: 'skipped_missing_data',
            error: !childName ? 'no child_name' : 'no parent contact',
          })
          continue
        }

        const parentJid = rawContact.includes('@')
          ? rawContact
          : normalizeUkPhoneToJid(rawContact)

        // Idempotency: don't double-blast if there's already a booking for
        // this (promotion, member) pair.
        const existing = await sql`
          SELECT id FROM camp_bookings
          WHERE promotion_id = ${params.id} AND member_id = ${member.id}
          LIMIT 1
        `
        if (existing.rows.length > 0) {
          result.skipped++
          result.details.push({
            memberId: member.id,
            childName,
            status: 'skipped_already_invited',
          })
          continue
        }

        // Build the AI invite for this specific child.
        let inviteMessage: string
        try {
          inviteMessage = await generateCampInviteMessage({
            parentFirstName: (parentName || '').split(/\s+/)[0] || '',
            childName,
            campTitle: promotion.title || null,
            campDetail: promotion.detail,
            dayList: campDays,
            coachName,
            paymentLink: promotion.payment_link,
          })
        } catch (e) {
          console.error('[CAMP COHORT] AI invite gen failed for', member.id, e)
          // Fall back to a deterministic template so the parent still gets
          // a message they can act on.
          const lettered = campDays
            .map((d, i) => `${String.fromCharCode(97 + i)}) ${d.label} — £${Number(d.price_gbp).toFixed(2)}`)
            .join('\n')
          inviteMessage =
            `Hi${parentName ? ' ' + parentName.split(/\s+/)[0] : ''} — ${coachName} here. ` +
            `${promotion.title ? promotion.title + ': ' : ''}${promotion.detail}\n\n` +
            `Which days for ${childName}?\n${lettered}\n\nReply with the letters (e.g. "a, b") or say "all".`
        }

        // Create the booking BEFORE sending, so a webhook reply that races
        // back from the parent can always find the open row.
        const bookingId = await createCampBooking({
          promotionId: params.id,
          programmeId,
          memberId: member.id,
          parentJid,
          parentName,
          childName,
        })

        try {
          await sendWhatsAppMessage(parentJid, inviteMessage)
          result.sent++
          result.details.push({
            memberId: member.id,
            childName,
            status: 'sent',
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          // Mark the booking cancelled so the parent isn't stuck in a
          // half-state if the coach re-runs the blast later.
          await sql`
            UPDATE camp_bookings SET state = 'cancelled', updated_at = NOW()
            WHERE id = ${bookingId}
          `
          result.failed++
          result.details.push({
            memberId: member.id,
            childName,
            status: 'failed',
            error: msg,
          })
          console.error('[CAMP COHORT] send failed for', member.id, msg)
        }
      }
    }

    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('[CAMP COHORT] error:', error)
    return NextResponse.json({ error: 'Failed to send camp cohort' }, { status: 500 })
  }
}
