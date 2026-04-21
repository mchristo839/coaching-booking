// app/api/referrals/nudges/route.ts
// Hourly cron (from Contabo) that processes the referral nudge queue.
// Steps (in order, one per referral per run):
//   pre_session    — 24 hours before first_session_at
//   session_day    — on the day of first_session_at
//   post_session   — 24 hours after first_session_at (if still not converted)
//   lapsed_check   — 7 days after creation with no conversion
//
// Idempotent: each step only fires once (tracked via last_nudge_step).
// Bearer-token protected.

import { NextRequest, NextResponse } from 'next/server'
import {
  listReferralsDueForNudge,
  markReferralNudged,
  logNotification,
} from '@/app/lib/control-centre-db'
import { generateReferralNudge, type NudgeStep } from '@/app/lib/ai-messages'
import { sendWhatsAppMessage } from '@/app/lib/evolution'

function isAuthorised(request: NextRequest): boolean {
  const secret = process.env.HEALTH_CHECK_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

const STEP_ORDER: NudgeStep[] = ['pre_session', 'session_day', 'post_session', 'lapsed_check']

/** Decide which nudge step (if any) is due for a given referral now. */
function chooseStep(r: Record<string, unknown>): NudgeStep | null {
  const now = Date.now()
  const created = new Date(r.created_at as string).getTime()
  const firstSession = r.first_session_at
    ? new Date(r.first_session_at as string).getTime()
    : null
  const lastStep = (r.last_nudge_step as string | null) || null
  const lastStepIdx = lastStep ? STEP_ORDER.indexOf(lastStep as NudgeStep) : -1

  // Only consider steps strictly after the last one sent
  const after = (step: NudgeStep) => STEP_ORDER.indexOf(step) > lastStepIdx

  // pre_session: within 24h window BEFORE first session
  if (firstSession && firstSession - now <= 24 * 3600 * 1000 && firstSession - now > 0) {
    if (after('pre_session')) return 'pre_session'
  }

  // session_day: same calendar date as first_session (within 12h)
  if (firstSession && Math.abs(firstSession - now) <= 12 * 3600 * 1000) {
    if (after('session_day')) return 'session_day'
  }

  // post_session: 24h after first session
  if (firstSession && now - firstSession >= 24 * 3600 * 1000 && now - firstSession < 72 * 3600 * 1000) {
    const status = r.status as string
    if (status !== 'converted' && after('post_session')) return 'post_session'
  }

  // lapsed_check: 7 days after creation, no conversion
  if (now - created >= 7 * 24 * 3600 * 1000) {
    const status = r.status as string
    if (status !== 'converted' && after('lapsed_check')) return 'lapsed_check'
  }

  return null
}

export async function POST(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  try {
    const referrals = await listReferralsDueForNudge()
    const results: Array<{ id: string; step: NudgeStep | null; sent: boolean; error?: string }> = []

    for (const r of referrals) {
      const step = chooseStep(r)
      if (!step) {
        continue
      }

      const phone = (r.friend_phone as string).replace(/\D/g, '')
      if (!phone) {
        results.push({ id: r.id as string, step, sent: false, error: 'no phone' })
        continue
      }
      const jid = `${phone}@s.whatsapp.net`
      const coachName = `${r.coach_first_name || ''} ${r.coach_last_name || ''}`.trim()

      try {
        const message = await generateReferralNudge(step, {
          friendFirstName: r.friend_first_name as string,
          childName: r.child_name as string | null,
          programmeName: r.programme_name as string,
          coachName,
          venue: r.venue_name as string | null,
          firstSessionAt: r.first_session_at as string | null,
          referredByName: r.referred_by_name as string | null,
        })

        await sendWhatsAppMessage(jid, message)
        await markReferralNudged(r.id as string, step)
        await logNotification({
          eventType: `referral_nudge_${step}`,
          programmeId: r.programme_id as string,
          recipientType: 'parent',
          recipientJid: jid,
          status: 'sent',
        })
        results.push({ id: r.id as string, step, sent: true })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await logNotification({
          eventType: `referral_nudge_${step}`,
          programmeId: r.programme_id as string,
          recipientType: 'parent',
          recipientJid: jid,
          status: 'failed',
          error: msg,
        })
        results.push({ id: r.id as string, step, sent: false, error: msg })
      }
    }

    return NextResponse.json({
      processed: results.length,
      results,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[REFERRAL NUDGES] error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
