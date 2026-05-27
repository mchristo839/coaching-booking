// app/lib/cancellation.ts
// Flow 6 — Cancellation & Rescheduling (Paul's spec).
// Member messages "cancel" → bot finds their upcoming sessions → confirms →
// applies cancellation policy → releases slot → notifies waitlist.
//
// SERVER-SIDE ONLY.

import { sql } from '@/app/lib/sql'
import { sendWhatsAppMessage } from '@/app/lib/evolution'

const CANCEL_INTENT_PATTERN = /\b(cancel|cancellation|can[''’]?t make|not coming|cant come|remove me|drop out)\b/i

export type CancellationState =
  | 'awaiting_session_choice'
  | 'awaiting_confirm'
  | 'completed'
  | 'cancelled'
  | 'expired'

interface UpcomingSession {
  id: string
  coach_id: string
  slot_id: string | null
  session_date: string
  start_time: string
  end_time: string
  duration_min: number
  price_gbp: string | null
}

// ─── Lookups ───

async function listUpcomingSessions(memberId: string, limit = 5): Promise<UpcomingSession[]> {
  const { rows } = await sql`
    SELECT id, coach_id, slot_id,
           session_date::text as session_date,
           start_time::text as start_time,
           end_time::text as end_time,
           duration_min, price_gbp::text as price_gbp
    FROM pt_sessions
    WHERE member_id = ${memberId}
      AND status = 'booked'
      AND session_date >= CURRENT_DATE
    ORDER BY session_date ASC, start_time ASC
    LIMIT ${limit}
  `
  return rows as unknown as UpcomingSession[]
}

async function findMemberByJid(jid: string): Promise<{ id: string; parent_name: string | null } | null> {
  const digits = jid.replace(/@.*$/, '').replace(/\D/g, '')
  const { rows } = await sql`
    SELECT id, parent_name FROM members
    WHERE parent_whatsapp_id = ${jid}
       OR parent_whatsapp_id = ${digits}
       OR regexp_replace(COALESCE(parent_phone, ''), '\\D', '', 'g') = ${digits}
    LIMIT 1
  `
  return (rows[0] as { id: string; parent_name: string | null } | undefined) || null
}

async function findOpenCancellationState(jid: string) {
  const { rows } = await sql`
    SELECT id, member_jid, member_id, state, session_options::text as session_options_text,
           chosen_session_id, expires_at::text as expires_at
    FROM cancellation_state
    WHERE member_jid = ${jid}
      AND state IN ('awaiting_session_choice','awaiting_confirm')
      AND expires_at > NOW()
    ORDER BY created_at DESC LIMIT 1
  `
  if (!rows[0]) return null
  const r = rows[0] as { id: string; member_jid: string; member_id: string | null; state: CancellationState; session_options_text: string | null; chosen_session_id: string | null; expires_at: string }
  return {
    ...r,
    session_options: r.session_options_text ? (JSON.parse(r.session_options_text) as string[]) : [],
  }
}

async function setCancellationState(id: string, state: CancellationState, chosenSessionId?: string | null) {
  await sql`
    UPDATE cancellation_state
    SET state = ${state},
        chosen_session_id = COALESCE(${chosenSessionId ?? null}, chosen_session_id),
        updated_at = NOW()
    WHERE id = ${id}
  `
}

// ─── Cancellation policy ───

async function getCancellationPolicy(coachId: string): Promise<{ hours: number; feePct: number }> {
  const { rows } = await sql`
    SELECT cancellation_policy_hours, late_cancel_fee_pct
    FROM coaches_v2 WHERE id = ${coachId} LIMIT 1
  `
  return {
    hours: Number(rows[0]?.cancellation_policy_hours ?? 24),
    feePct: Number(rows[0]?.late_cancel_fee_pct ?? 50),
  }
}

function isInsidePolicyWindow(sessionDate: string, startTime: string, policyHours: number): boolean {
  const sessionAt = new Date(`${sessionDate}T${startTime.slice(0, 8)}Z`)
  const cutoffMs = sessionAt.getTime() - policyHours * 60 * 60 * 1000
  return Date.now() > cutoffMs  // true = LATE cancellation (inside policy window)
}

// ─── Message builders ───

function formatSessionLine(s: UpcomingSession, letter?: string): string {
  const d = new Date(s.session_date + 'T00:00:00')
  const datePart = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  const [hStr, mStr] = s.start_time.split(':')
  let h = parseInt(hStr, 10)
  const m = (mStr || '00').padStart(2, '0')
  const ampm = h >= 12 ? 'pm' : 'am'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  const timePart = m === '00' ? `${h}${ampm}` : `${h}:${m}${ampm}`
  return `${letter ? letter + ') ' : ''}${datePart} ${timePart} (${s.duration_min} min)`
}

function buildSessionChoiceMessage(sessions: UpcomingSession[]): string {
  const lettered = sessions.map((s, i) => formatSessionLine(s, String.fromCharCode(97 + i))).join('\n')
  return `Which session would you like to cancel?\n\n${lettered}\n\nReply with a letter (a, b, …) or "all".`
}

function buildConfirmMessage(s: UpcomingSession, late: boolean, feePct: number): string {
  const line = formatSessionLine(s)
  if (late) {
    const fee = s.price_gbp ? ` (£${(Number(s.price_gbp) * feePct / 100).toFixed(2)} late fee, ${feePct}%)` : ''
    return `Just to confirm — cancel ${line}?${fee}\n\nReply YES to cancel, NO to keep it.`
  }
  return `Just to confirm — cancel ${line}?\n\nReply YES to cancel, NO to keep it.`
}

function buildCancelledMessage(s: UpcomingSession, late: boolean, feePct: number): string {
  const line = formatSessionLine(s)
  if (late) {
    return `Cancelled ${line}. Late cancellation fee applies (${feePct}%) — the studio will confirm.\n\nWant to rebook? Reply "book" to see what's available.`
  }
  return `Cancelled ${line}. No fee.\n\nWant to rebook? Reply "book" to see what's available.`
}

// ─── Slot + waitlist hook ───

async function releaseSlotAndNotifyWaitlist(slotId: string | null, coachId: string): Promise<void> {
  if (slotId) {
    await sql`
      UPDATE calendar_slots
      SET status = 'available',
          booked_by_member_id = NULL,
          pt_session_id = NULL,
          updated_at = NOW()
      WHERE id = ${slotId}
    `
  }
  // Notify oldest waitlist entry for this coach
  const { rows: waitRows } = await sql`
    SELECT id, member_jid FROM waitlist
    WHERE coach_id = ${coachId} AND status = 'waiting'
    ORDER BY created_at ASC LIMIT 1
  `
  if (waitRows[0]) {
    const wait = waitRows[0] as { id: string; member_jid: string }
    await sql`
      UPDATE waitlist
      SET status = 'notified',
          notified_slot_id = ${slotId},
          notified_at = NOW(),
          hold_expires_at = NOW() + INTERVAL '2 hours',
          updated_at = NOW()
      WHERE id = ${wait.id}
    `
    try {
      await sendWhatsAppMessage(
        wait.member_jid,
        `Good news 🎉 a session has just opened up. Reply "book" within the next 2 hours to claim it.`
      )
    } catch (e) {
      console.error('[waitlist notify] failed:', e)
    }
  }
}

// ─── Webhook entry point ───

export async function tryHandleCancellationReply(jid: string, text: string): Promise<boolean> {
  // Path A: in-flight cancellation state
  const open = await findOpenCancellationState(jid)
  if (open) {
    return processOpenCancellation(open, jid, text)
  }

  // Path B: detect cancel intent + start new flow
  if (!CANCEL_INTENT_PATTERN.test(text)) return false

  const member = await findMemberByJid(jid)
  if (!member) return false

  const upcoming = await listUpcomingSessions(member.id)
  if (upcoming.length === 0) {
    await sendWhatsAppMessage(jid, "I don't see any upcoming sessions for you to cancel. Anything else I can help with?")
    return true
  }

  if (upcoming.length === 1) {
    // Skip the choice step — go straight to confirm
    const s = upcoming[0]
    const { hours, feePct } = await getCancellationPolicy(s.coach_id)
    const late = isInsidePolicyWindow(s.session_date, s.start_time, hours)
    await sql`
      INSERT INTO cancellation_state (member_jid, member_id, state, session_options, chosen_session_id)
      VALUES (${jid}, ${member.id}, 'awaiting_confirm',
              ${JSON.stringify([s.id])}::jsonb, ${s.id})
    `
    await sendWhatsAppMessage(jid, buildConfirmMessage(s, late, feePct))
    return true
  }

  await sql`
    INSERT INTO cancellation_state (member_jid, member_id, state, session_options)
    VALUES (${jid}, ${member.id}, 'awaiting_session_choice',
            ${JSON.stringify(upcoming.map((s) => s.id))}::jsonb)
  `
  await sendWhatsAppMessage(jid, buildSessionChoiceMessage(upcoming))
  return true
}

async function processOpenCancellation(
  state: { id: string; state: CancellationState; session_options: string[]; chosen_session_id: string | null; member_id: string | null },
  jid: string,
  text: string
): Promise<boolean> {
  const t = text.trim().toLowerCase()

  if (state.state === 'awaiting_session_choice') {
    const letterMatch = t.match(/^([a-z])\b/)
    if (!letterMatch) {
      await sendWhatsAppMessage(jid, 'Sorry, didn\'t catch that — please reply with the letter (a, b, …) of the session to cancel.')
      return true
    }
    const idx = letterMatch[1].charCodeAt(0) - 97
    const sessionId = state.session_options[idx]
    if (!sessionId) {
      await sendWhatsAppMessage(jid, "That letter doesn't match an option. Please pick from the list.")
      return true
    }
    const { rows } = await sql`
      SELECT id, coach_id, slot_id,
             session_date::text as session_date,
             start_time::text as start_time,
             end_time::text as end_time,
             duration_min, price_gbp::text as price_gbp
      FROM pt_sessions WHERE id = ${sessionId} LIMIT 1
    `
    const s = rows[0] as unknown as UpcomingSession
    if (!s) {
      await setCancellationState(state.id, 'cancelled')
      return true
    }
    const { hours, feePct } = await getCancellationPolicy(s.coach_id)
    const late = isInsidePolicyWindow(s.session_date, s.start_time, hours)
    await setCancellationState(state.id, 'awaiting_confirm', s.id)
    await sendWhatsAppMessage(jid, buildConfirmMessage(s, late, feePct))
    return true
  }

  if (state.state === 'awaiting_confirm') {
    if (/^(no|nope|nah|keep|cancel that)/.test(t)) {
      await sendWhatsAppMessage(jid, 'No worries — your session stays booked. 👍')
      await setCancellationState(state.id, 'cancelled')
      return true
    }
    if (!/^(y|yes|yep|confirm|cancel|ok|sure)/.test(t)) {
      await sendWhatsAppMessage(jid, 'Reply YES to cancel or NO to keep the session.')
      return true
    }
    if (!state.chosen_session_id) {
      await setCancellationState(state.id, 'cancelled')
      return true
    }
    // Execute cancellation
    const { rows } = await sql`
      SELECT id, coach_id, slot_id,
             session_date::text as session_date,
             start_time::text as start_time,
             end_time::text as end_time,
             duration_min, price_gbp::text as price_gbp
      FROM pt_sessions WHERE id = ${state.chosen_session_id} LIMIT 1
    `
    const s = rows[0] as unknown as UpcomingSession
    if (!s) {
      await setCancellationState(state.id, 'completed')
      return true
    }
    const { hours, feePct } = await getCancellationPolicy(s.coach_id)
    const late = isInsidePolicyWindow(s.session_date, s.start_time, hours)
    await sql`
      UPDATE pt_sessions
      SET status = 'cancelled',
          cancelled_at = NOW(),
          cancelled_by_member = true,
          cancellation_fee_gbp = ${late && s.price_gbp ? Number(s.price_gbp) * feePct / 100 : null},
          updated_at = NOW()
      WHERE id = ${s.id}
    `
    await releaseSlotAndNotifyWaitlist(s.slot_id, s.coach_id)
    await setCancellationState(state.id, 'completed')
    await sendWhatsAppMessage(jid, buildCancelledMessage(s, late, feePct))
    return true
  }

  return false
}
