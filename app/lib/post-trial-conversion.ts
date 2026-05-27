// app/lib/post-trial-conversion.ts
// Flow 9 — Post-Trial Conversion (Paul's spec).
//
// Cron-driven. Runs daily, finds completed trial pt_sessions, walks each
// through the conversion ladder:
//   T+2h post-trial   → thanks + score request (Flow 5 feedback already
//                       handles the score collection separately)
//   T+24h after score → conversion offer if score ≥ 4
//                     → manager flag if score ≤ 3 (no hard sell)
//   T+72h offer       → follow-up with social proof
//   T+7d follow-up    → final offer / "expires this week"
//   T+30d no convert  → status=dropped, may transition to Flow 8 (lapsed)
//
// SERVER-SIDE ONLY.

import { sql } from '@/app/lib/sql'
import { sendWhatsAppMessage } from '@/app/lib/evolution'

type Step = 'thanks_feedback' | 'offer' | 'followup_48h' | 'final_7d' | 'lapsed'

function messageFor(step: Step, ctx: {
  firstName: string | null
  coachName: string | null
  paymentLink: string | null
}): string {
  const name = ctx.firstName ? ctx.firstName : 'there'
  const coach = ctx.coachName || 'your trainer'
  switch (step) {
    case 'thanks_feedback':
      return `Hey ${name} — thanks for coming in for your first session with ${coach}! 💪 How was it? Quick 1–5 rating any time (5 = loved it).`
    case 'offer':
      return `So glad you enjoyed it ${name}! 🎉 Here's a one-off offer to keep going:\n\n→ £10 off your next session, or 25% off your first month membership.${ctx.paymentLink ? `\n\n${ctx.paymentLink}` : ''}\n\nReply "book" and I'll lock it in.`
    case 'followup_48h':
      return `Hi ${name} — quick nudge. Spots with ${coach} are filling fast this week. Want me to grab you one?`
    case 'final_7d':
      return `${name} — last shout from me. The trial offer runs out at the end of this week. After that we're back to standard prices. Want me to book you in?`
    case 'lapsed':
      return ''
  }
}

interface CandidateRow {
  pt_session_id: string
  member_id: string
  parent_name: string | null
  parent_whatsapp_id: string | null
  parent_phone: string | null
  coach_id: string | null
  coach_first_name: string | null
  coach_last_name: string | null
  session_date: string
  hours_since_completed: number
  feedback_score: number | null
  last_step: Step | null
  status: string | null
  payment_link: string | null
}

function jidFromRow(row: Pick<CandidateRow, 'parent_whatsapp_id' | 'parent_phone'>): string | null {
  if (row.parent_whatsapp_id) {
    return row.parent_whatsapp_id.includes('@')
      ? row.parent_whatsapp_id
      : `${row.parent_whatsapp_id.replace(/\D/g, '')}@s.whatsapp.net`
  }
  if (row.parent_phone) {
    const d = row.parent_phone.replace(/\D/g, '')
    if (!d) return null
    const normalized = d.startsWith('07') ? '44' + d.slice(1) : d.startsWith('0044') ? d.slice(2) : d
    return `${normalized}@s.whatsapp.net`
  }
  return null
}

export interface PostTrialRunResult {
  scanned: number
  fired: number
  details: Array<{ ptSessionId: string; step: Step; sent: boolean; error?: string }>
}

export async function runPostTrialConversion(): Promise<PostTrialRunResult> {
  // Find trial sessions completed in the last 30 days + their post-trial state.
  // payment_link comes from the same fallback path as the PT booking flow:
  // most-recent refer-a-friend promotion's link for that coach.
  const { rows } = await sql`
    SELECT
      s.id as pt_session_id,
      s.member_id,
      m.parent_name, m.parent_whatsapp_id, m.parent_phone,
      s.coach_id,
      c.first_name as coach_first_name, c.last_name as coach_last_name,
      s.session_date::text as session_date,
      EXTRACT(EPOCH FROM (NOW() - (s.session_date::timestamp + s.start_time::interval))) / 3600
        as hours_since_completed,
      s.feedback_score,
      pts.last_step,
      pts.status,
      (
        SELECT pr.payment_link FROM promotions pr
        JOIN promotion_targets pgt ON pgt.promotion_id = pr.id
        JOIN programmes prg ON prg.id = pgt.programme_id
        WHERE prg.coach_id = s.coach_id AND pr.payment_link IS NOT NULL
        ORDER BY pr.created_at DESC LIMIT 1
      ) as payment_link
    FROM pt_sessions s
    JOIN members m ON m.id = s.member_id
    LEFT JOIN coaches_v2 c ON c.id = s.coach_id
    LEFT JOIN post_trial_state pts ON pts.pt_session_id = s.id
    WHERE s.is_trial = true
      AND s.status IN ('booked','completed')
      AND s.session_date BETWEEN CURRENT_DATE - INTERVAL '45 days' AND CURRENT_DATE
      AND (pts.status IS NULL OR pts.status = 'in_progress')
  `

  const result: PostTrialRunResult = { scanned: rows.length, fired: 0, details: [] }

  for (const row of rows as unknown as CandidateRow[]) {
    if (row.hours_since_completed < 2) continue  // give Flow 5 time to fire first
    const jid = jidFromRow(row)
    if (!jid) continue

    const firstName = (row.parent_name || '').split(/\s+/)[0]
    const coachName = `${row.coach_first_name || ''} ${row.coach_last_name || ''}`.trim() || null
    let nextStep: Step | null = null

    if (!row.last_step) {
      // Brand-new trial completion → thanks
      nextStep = 'thanks_feedback'
    } else if (row.last_step === 'thanks_feedback') {
      // Need at least 22h since thanks before we send offer
      if (row.hours_since_completed < 24) continue
      if (row.feedback_score == null) continue  // wait for feedback
      if (row.feedback_score <= 3) {
        // No hard sell on low scores — flag manager, mark for review
        await sql`
          INSERT INTO post_trial_state (pt_session_id, member_id, last_step, last_step_at, feedback_score, status)
          VALUES (${row.pt_session_id}, ${row.member_id}, 'lapsed', NOW(), ${row.feedback_score}, 'manager_review')
          ON CONFLICT (pt_session_id) DO UPDATE
            SET last_step = 'lapsed', status = 'manager_review',
                feedback_score = EXCLUDED.feedback_score,
                last_step_at = NOW(), updated_at = NOW()
        `
        result.details.push({ ptSessionId: row.pt_session_id, step: 'lapsed', sent: false, error: 'low_score_manager_review' })
        continue
      }
      nextStep = 'offer'
    } else if (row.last_step === 'offer') {
      if (row.hours_since_completed < 24 + 48) continue
      nextStep = 'followup_48h'
    } else if (row.last_step === 'followup_48h') {
      if (row.hours_since_completed < 24 + 48 + 7 * 24) continue
      nextStep = 'final_7d'
    } else if (row.last_step === 'final_7d') {
      if (row.hours_since_completed < 24 * 30) continue
      nextStep = 'lapsed'
    }

    if (!nextStep) continue

    if (nextStep === 'lapsed') {
      await sql`
        INSERT INTO post_trial_state (pt_session_id, member_id, last_step, last_step_at, feedback_score, status)
        VALUES (${row.pt_session_id}, ${row.member_id}, 'lapsed', NOW(), ${row.feedback_score}, 'dropped')
        ON CONFLICT (pt_session_id) DO UPDATE
          SET last_step = 'lapsed', status = 'dropped',
              last_step_at = NOW(), updated_at = NOW()
      `
      result.details.push({ ptSessionId: row.pt_session_id, step: 'lapsed', sent: false })
      continue
    }

    const text = messageFor(nextStep, { firstName, coachName, paymentLink: row.payment_link })
    if (!text) continue

    try {
      await sendWhatsAppMessage(jid, text)
      await sql`
        INSERT INTO post_trial_state (pt_session_id, member_id, last_step, last_step_at, feedback_score, status, offer_sent)
        VALUES (${row.pt_session_id}, ${row.member_id}, ${nextStep}, NOW(), ${row.feedback_score},
                'in_progress', ${nextStep === 'offer'})
        ON CONFLICT (pt_session_id) DO UPDATE
          SET last_step = EXCLUDED.last_step,
              last_step_at = NOW(),
              feedback_score = EXCLUDED.feedback_score,
              offer_sent = post_trial_state.offer_sent OR EXCLUDED.offer_sent,
              updated_at = NOW()
      `
      result.fired++
      result.details.push({ ptSessionId: row.pt_session_id, step: nextStep, sent: true })
    } catch (e) {
      result.details.push({ ptSessionId: row.pt_session_id, step: nextStep, sent: false, error: String(e) })
    }
  }
  return result
}
