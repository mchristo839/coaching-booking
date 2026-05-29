// app/api/promotions/[id]/send-dm/route.ts
// POST: DM a refer-a-friend promotion's link to selected individual members.
//
// Compliance: only members who have NOT opted out are messaged, every message
// carries a "Reply STOP to opt out" footer, and a STOP reply is honoured in the
// webhook (sets members.marketing_opt_out). We only DM existing, signed-up
// members (soft opt-in) — never harvested group participants.
//
// Attribution: the referral link is rewritten to carry ?ref=<memberId> so the
// public landing page can pre-attribute the referral to the member we sent it
// to (the public POST validates the id belongs to the programme).

import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/app/lib/auth'
import {
  getPromotion,
  getPromotionTargets,
  listMessageableMembersForProgramme,
  logNotification,
  type MessageableMember,
} from '@/app/lib/control-centre-db'
import { sendWhatsAppMessage } from '@/app/lib/evolution'
import { requireAuthorityOver, PermissionError } from '@/app/lib/permissions'

const OPT_OUT_FOOTER = 'Reply STOP to opt out.'

// Pace sends so we don't trip WhatsApp's spam heuristics on the unofficial
// (Baileys) stack — mass-firing DMs is a fast route to a number ban.
const SEND_GAP_MS = 600

function buildMemberMessage(base: string, slug: string | null, memberId: string): string {
  let msg = base
  if (slug) {
    // Add the referrer hint to the referral link (first occurrence only).
    msg = msg.replace(`/refer/${slug}`, `/refer/${slug}?ref=${memberId}`)
  }
  if (!/\bstop\b/i.test(msg)) {
    msg = `${msg.trimEnd()}\n\n${OPT_OUT_FOOTER}`
  }
  return msg
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
    const body = await request.json().catch(() => ({}))
    const memberIds: string[] = Array.isArray(body?.memberIds)
      ? body.memberIds.filter((x: unknown) => typeof x === 'string')
      : []
    if (memberIds.length === 0) {
      return NextResponse.json({ error: 'No members selected' }, { status: 400 })
    }

    const promotion = await getPromotion(params.id)
    if (!promotion) {
      return NextResponse.json({ error: 'Promotion not found' }, { status: 404 })
    }
    if (promotion.created_by !== auth.coachId) {
      return NextResponse.json({ error: 'Not the creator' }, { status: 403 })
    }
    if (promotion.promotion_type !== 'refer_a_friend') {
      return NextResponse.json(
        { error: 'Individual DMs are only supported for refer-a-friend promotions' },
        { status: 400 }
      )
    }
    if (!promotion.generated_message) {
      return NextResponse.json({ error: 'Promotion has no message to send' }, { status: 400 })
    }

    const targets = await getPromotionTargets(params.id)
    await requireAuthorityOver(auth.coachId, targets.map((t) => t.programme_id))

    // Build the messageable set across all target programmes, keyed by id.
    const byId = new Map<string, MessageableMember & { programmeId: string }>()
    for (const t of targets) {
      const members = await listMessageableMembersForProgramme(t.programme_id)
      for (const m of members) {
        if (!byId.has(m.id)) byId.set(m.id, { ...m, programmeId: t.programme_id })
      }
    }

    let sent = 0
    let failed = 0
    const skipped: Array<{ memberId: string; reason: string }> = []
    let first = true

    for (const memberId of memberIds) {
      const member = byId.get(memberId)
      if (!member) {
        skipped.push({ memberId, reason: 'not a contactable member of this promotion' })
        continue
      }
      if (member.opted_out) {
        skipped.push({ memberId, reason: 'opted out of marketing' })
        continue
      }

      if (!first) await new Promise((r) => setTimeout(r, SEND_GAP_MS))
      first = false

      const message = buildMemberMessage(promotion.generated_message, promotion.slug, memberId)
      try {
        await sendWhatsAppMessage(member.jid, message)
        await logNotification({
          eventType: 'referral_dm',
          triggerUser: auth.coachId,
          programmeId: member.programmeId,
          recipientType: 'member',
          recipientJid: member.jid,
          status: 'sent',
        })
        sent++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await logNotification({
          eventType: 'referral_dm',
          triggerUser: auth.coachId,
          programmeId: member.programmeId,
          recipientType: 'member',
          recipientJid: member.jid,
          status: 'failed',
          error: msg,
        })
        failed++
      }
    }

    return NextResponse.json({ success: true, sent, failed, skipped })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('[PROMOTIONS SEND-DM] error:', error)
    return NextResponse.json({ error: 'Failed to send referral DMs' }, { status: 500 })
  }
}
