// app/api/referrals/[id]/issue-credit/route.ts
// Coach action: issue the referrer's free-class credit after the referee
// attended their taster session. Spec §4.2.
//
// Idempotent: re-tapping after issuance is a no-op (returns reason
// 'already_honoured'). The handler delegates the writes + the
// ownership/preconditions check to issueReferralCreditByCoach so the
// state-machine logic stays in one place.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/app/lib/auth'
import {
  issueReferralCreditByCoach,
  getMemberCreditContext,
  logNotification,
} from '@/app/lib/control-centre-db'
import { buildReferralCreditIssuedMessage } from '@/app/lib/ai-messages'
import { sendWhatsAppMessage } from '@/app/lib/evolution'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthFromRequest(request)
  if (!auth || !auth.coachId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const result = await issueReferralCreditByCoach(params.id, auth.coachId)

  if (!result.issued && result.reason === 'forbidden') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!result.issued && result.reason === 'referral_not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (!result.issued && result.reason === 'referrer_unresolved') {
    return NextResponse.json(
      { error: 'Referrer is unresolved — cannot auto-issue credit. Resolve manually first.' },
      { status: 400 }
    )
  }
  if (!result.issued && result.reason === 'referee_not_attended') {
    return NextResponse.json(
      { error: 'Referee has not attended yet — mark attended first.' },
      { status: 400 }
    )
  }

  // Fire the WhatsApp notification when we genuinely just issued (don't
  // re-spam on an idempotent retry).
  if (result.issued && result.memberId) {
    const ctx = await getMemberCreditContext(result.memberId)
    if (ctx) {
      const jid = ctx.parent_whatsapp_id?.includes('@')
        ? ctx.parent_whatsapp_id
        : (ctx.parent_phone || ctx.parent_whatsapp_id || '').replace(/\D/g, '') + '@s.whatsapp.net'

      if (jid && jid !== '@s.whatsapp.net') {
        const firstName = (ctx.parent_name || '').trim().split(/\s+/)[0] || 'there'
        const message = buildReferralCreditIssuedMessage({
          referrerFirstName: firstName,
          refereeChildName: result.refereeChildName,
          newBalance: result.balance,
        })
        try {
          await sendWhatsAppMessage(jid, message)
          await logNotification({
            eventType: 'referral_credit_issued',
            triggerUser: auth.coachId,
            programmeId: ctx.programme_id,
            recipientType: 'parent',
            recipientJid: jid,
            status: 'sent',
          })
        } catch (e) {
          await logNotification({
            eventType: 'referral_credit_issued',
            triggerUser: auth.coachId,
            programmeId: ctx.programme_id,
            recipientType: 'parent',
            recipientJid: jid,
            status: 'failed',
            error: e instanceof Error ? e.message : String(e),
          })
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    issued: result.issued,
    balance: result.balance,
    reason: result.reason,
  })
}
