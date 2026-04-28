// app/lib/feedback.ts
// Server-side helpers for the post-session feedback flow (fitness vertical).
// SERVER-SIDE ONLY — uses sql template tag.

import { sql } from '@vercel/postgres'
import { sendWhatsAppMessage } from '@/app/lib/evolution'
import {
  generateFeedbackFollowUp,
  buildReferralHandoffMessage,
  buildReferralDeclineAck,
} from '@/app/lib/ai-messages'

const PUBLIC_APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://coaching-booking-v3.vercel.app').trim()

// UK-flavoured phone normalization. Best-effort: strips non-digits and
// canonicalises common UK formats. Anything else is passed through with
// non-digits stripped — the caller is responsible for sanity-checking.
export function normalizeUkPhoneToJid(input: string): string {
  let digits = input.replace(/[^0-9]/g, '')
  if (digits.startsWith('0044')) {
    digits = digits.slice(2) // 0044... → 44...
  } else if (digits.startsWith('07')) {
    digits = '44' + digits.slice(1) // 07... → 447...
  } else if (digits.startsWith('7') && digits.length === 10) {
    digits = '44' + digits // 7xxxxxxxxx (rare) → 447...
  }
  return digits + '@s.whatsapp.net'
}

export interface PendingFeedbackRow {
  id: string
  programme_id: string
  client_jid: string
  client_name: string | null
  pt_coach_id: string | null
  pt_name: string | null
  session_date: string | null
  state: 'awaiting_score' | 'awaiting_comment_low' | 'awaiting_referral_yes_no' | 'completed' | 'expired'
  refer_a_friend_slug: string | null
  feedback_id: string | null
  created_at: string
  expires_at: string
}

// Look up the open feedback request for a given client JID. Returns null
// when the client has no open request (the common case for non-feedback
// 1:1 messages — webhook falls through silently).
export async function findOpenPendingFeedback(clientJid: string): Promise<PendingFeedbackRow | null> {
  const { rows } = await sql`
    SELECT id, programme_id, client_jid, client_name, pt_coach_id, pt_name,
           session_date::text as session_date, state, refer_a_friend_slug,
           feedback_id, created_at, expires_at
    FROM pending_feedback
    WHERE client_jid = ${clientJid}
      AND state IN ('awaiting_score','awaiting_comment_low','awaiting_referral_yes_no')
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1
  `
  return (rows[0] as PendingFeedbackRow | undefined) || null
}

export async function createPendingFeedback(input: {
  programmeId: string
  clientJid: string
  clientName: string | null
  ptCoachId?: string | null
  ptName?: string | null
  sessionDate?: string | null
  referSlug?: string | null
}) {
  const { rows } = await sql`
    INSERT INTO pending_feedback (
      programme_id, client_jid, client_name, pt_coach_id, pt_name,
      session_date, refer_a_friend_slug
    )
    VALUES (
      ${input.programmeId}, ${input.clientJid}, ${input.clientName || null},
      ${input.ptCoachId || null}, ${input.ptName || null},
      ${input.sessionDate || null}, ${input.referSlug || null}
    )
    RETURNING id
  `
  return rows[0].id as string
}

export async function setPendingFeedbackState(
  id: string,
  state: PendingFeedbackRow['state'],
  feedbackId?: string | null
) {
  await sql`
    UPDATE pending_feedback
    SET state = ${state},
        updated_at = NOW(),
        feedback_id = COALESCE(${feedbackId || null}, feedback_id)
    WHERE id = ${id}
  `
}

export async function markPendingFeedbackPromptId(id: string, messageId: string | null) {
  if (!messageId) return
  await sql`UPDATE pending_feedback SET prompt_message_id = ${messageId}, updated_at = NOW() WHERE id = ${id}`
}

// Insert a finalised score row in session_feedback. Sets the manager flag
// when score is 1 or 2.
export async function recordSessionFeedback(input: {
  programmeId: string
  clientJid: string
  clientName: string | null
  ptCoachId?: string | null
  ptName?: string | null
  sessionDate?: string | null
  score: number
}): Promise<string> {
  const flagged = input.score <= 2
  const { rows } = await sql`
    INSERT INTO session_feedback (
      programme_id, client_jid, client_name, pt_coach_id, pt_name,
      session_date, score, flagged_for_manager, responded_at
    )
    VALUES (
      ${input.programmeId}, ${input.clientJid}, ${input.clientName || null},
      ${input.ptCoachId || null}, ${input.ptName || null},
      ${input.sessionDate || null}, ${input.score}, ${flagged}, NOW()
    )
    RETURNING id
  `
  return rows[0].id as string
}

// Append qualitative feedback (low-score path) onto an existing row.
export async function attachWrittenFeedback(feedbackId: string, comment: string) {
  await sql`
    UPDATE session_feedback
    SET written_feedback = ${comment}, responded_at = NOW()
    WHERE id = ${feedbackId}
  `
}

// Find the most recent active refer_a_friend promotion for the programme,
// so the high-score path can hand the client a ready-made referral link.
export async function findActiveReferSlugForProgramme(programmeId: string): Promise<string | null> {
  const { rows } = await sql`
    SELECT p.slug
    FROM promotions p
    JOIN promotion_targets pt ON pt.promotion_id = p.id
    WHERE pt.programme_id = ${programmeId}
      AND p.promotion_type = 'refer_a_friend'
      AND p.slug IS NOT NULL
      AND p.status IN ('sent','draft')
    ORDER BY p.created_at DESC
    LIMIT 1
  `
  return rows[0]?.slug || null
}

// Parse a free-text WhatsApp reply into a 1-5 score, or null when it
// doesn't look like a rating. Accepts "5", "five", "5/5", "⭐⭐⭐⭐⭐", "5!".
export function parseScore(text: string): number | null {
  const trimmed = text.trim().toLowerCase()
  if (trimmed.length === 0) return null

  const stars = trimmed.match(/⭐/g)?.length ?? 0
  if (stars >= 1 && stars <= 5) return stars

  const direct = trimmed.match(/^([1-5])(?:[\s\/!.,]|$)/)
  if (direct) return parseInt(direct[1], 10)

  const wordMap: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
  }
  for (const [word, n] of Object.entries(wordMap)) {
    if (new RegExp(`(^|\\b)${word}(\\b|$)`).test(trimmed)) return n
  }

  return null
}

// Y/N parser for the referral handoff path.
export function parseYesNo(text: string): 'yes' | 'no' | null {
  const trimmed = text.trim().toLowerCase()
  if (/^(y|yes|yep|yeah|sure|please|ok|okay|👍|✅)/.test(trimmed)) return 'yes'
  if (/^(n|no|nope|nah|not now|maybe later|❌)/.test(trimmed)) return 'no'
  return null
}

// ─── Webhook handler for 1:1 feedback replies ───
// Self-contained so the webhook stays simple and any failure stays inside
// this function. Returns true when the message was consumed by the
// feedback flow (webhook should stop further processing); false when
// there's no open feedback request for this sender (webhook falls
// through to its normal logic).

export async function tryHandleFeedbackReply(
  senderJid: string,
  messageText: string
): Promise<boolean> {
  // Self-gate: only act when we have an open request for this JID. The
  // partial index on pending_feedback keeps this lookup O(1) and zero-cost
  // for sender JIDs that aren't in flight.
  const pending = await findOpenPendingFeedback(senderJid)
  if (!pending) return false

  const clientFirstName = (pending.client_name || 'there').split(/\s+/)[0]

  try {
    switch (pending.state) {
      case 'awaiting_score': {
        const score = parseScore(messageText)
        if (score === null) {
          await sendWhatsAppMessage(
            senderJid,
            `Sorry ${clientFirstName}, didn't catch that — please reply with a number from 1 to 5.`
          )
          return true
        }
        // Record the score, then route by score.
        const feedbackId = await recordSessionFeedback({
          programmeId: pending.programme_id,
          clientJid: senderJid,
          clientName: pending.client_name,
          ptCoachId: pending.pt_coach_id || undefined,
          ptName: pending.pt_name || undefined,
          sessionDate: pending.session_date || undefined,
          score,
        })

        // Reply text generated by AI for warmth, score-aware.
        let reply: string
        try {
          reply = await generateFeedbackFollowUp({ clientFirstName, score })
        } catch {
          // Fall back to a plain thank-you if Claude is unavailable —
          // never leave the client hanging.
          reply = score >= 4
            ? `Thanks ${clientFirstName}! Glad you enjoyed it 💪`
            : `Thanks for the feedback ${clientFirstName}.`
        }
        await sendWhatsAppMessage(senderJid, reply)

        // State transition based on score band:
        //   1-2 → ask for written feedback
        //   3   → done
        //   4-5 → ask if they want a refer-a-friend link
        let nextState: PendingFeedbackRow['state']
        if (score <= 2) nextState = 'awaiting_comment_low'
        else if (score >= 4 && pending.refer_a_friend_slug) nextState = 'awaiting_referral_yes_no'
        else nextState = 'completed'
        await setPendingFeedbackState(pending.id, nextState, feedbackId)
        return true
      }

      case 'awaiting_comment_low': {
        // Treat the whole message as their qualitative feedback. Cap
        // length defensively in case someone pastes War & Peace.
        const comment = messageText.trim().slice(0, 4000)
        if (pending.feedback_id) {
          await attachWrittenFeedback(pending.feedback_id, comment)
        }
        await sendWhatsAppMessage(
          senderJid,
          `Thanks ${clientFirstName} — I'll pass this to the studio manager. Your feedback stays confidential.`
        )
        await setPendingFeedbackState(pending.id, 'completed')
        return true
      }

      case 'awaiting_referral_yes_no': {
        const yn = parseYesNo(messageText)
        if (yn === 'yes' && pending.refer_a_friend_slug) {
          const link = `${PUBLIC_APP_URL}/refer/${pending.refer_a_friend_slug}`
          await sendWhatsAppMessage(
            senderJid,
            buildReferralHandoffMessage(link, clientFirstName)
          )
          await setPendingFeedbackState(pending.id, 'completed')
          return true
        }
        if (yn === 'no') {
          await sendWhatsAppMessage(senderJid, buildReferralDeclineAck(clientFirstName))
          await setPendingFeedbackState(pending.id, 'completed')
          return true
        }
        // Unparseable — nudge once.
        await sendWhatsAppMessage(
          senderJid,
          `Sorry ${clientFirstName}, didn't catch that — yes or no?`
        )
        return true
      }

      default:
        // 'completed' / 'expired' shouldn't reach here (filtered by the
        // partial index in findOpenPendingFeedback), but be defensive.
        return false
    }
  } catch (e) {
    console.error('[FEEDBACK HANDLER] error for pending', pending.id, e)
    // Swallow — webhook caller still got `true` semantics meaning we
    // claim ownership of the message, so it isn't double-processed by
    // the fallthrough group logic. We log it for ops.
    return true
  }
}

// List recent feedback (responses + outstanding requests) for the manager
// dashboard. Restricted by coach via the programmes they own.
export async function listRecentFeedbackForCoach(coachId: string, limit = 30) {
  const { rows: responses } = await sql`
    SELECT f.id, f.programme_id, p.programme_name, f.client_name, f.pt_name,
           f.score, f.written_feedback, f.flagged_for_manager,
           f.session_date::text as session_date,
           f.created_at, f.responded_at
    FROM session_feedback f
    JOIN programmes p ON p.id = f.programme_id
    WHERE p.coach_id = ${coachId}
    ORDER BY f.created_at DESC
    LIMIT ${limit}
  `
  const { rows: pending } = await sql`
    SELECT pf.id, pf.programme_id, p.programme_name, pf.client_name, pf.pt_name,
           pf.state, pf.created_at, pf.expires_at
    FROM pending_feedback pf
    JOIN programmes p ON p.id = pf.programme_id
    WHERE p.coach_id = ${coachId}
      AND pf.state IN ('awaiting_score','awaiting_comment_low','awaiting_referral_yes_no')
      AND pf.expires_at > NOW()
    ORDER BY pf.created_at DESC
    LIMIT ${limit}
  `
  return { responses, pending }
}
