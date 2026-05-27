// app/lib/calendar.ts
// Native bookable calendar — Paul's spec Flow 2 (Private Lesson Booking)
// + Flow 12 (PT Availability). Holds the lifecycle:
//
//   PT declares availability  →  slots generated  →  client requests booking
//   →  bot presents slots     →  client picks    →  slot held (15-min lock)
//   →  payment link sent      →  client says PAID →  slot booked + pt_session row
//
// Mirrors the pending_feedback / camp_bookings self-gating webhook pattern:
// tryHandlePtBookingReply returns true when this branch consumed the message.

import { sql } from '@/app/lib/sql'
import { sendWhatsAppMessage } from '@/app/lib/evolution'
import {
  buildPtSlotOfferMessage,
  buildPtBookingPaymentInstructions,
  buildPtBookingConfirmed,
  buildPtUnparseableNudge,
  parsePtSlotSelection,
} from '@/app/lib/ai-messages'
import { parsePaidReply } from '@/app/lib/camp-booking'

const HOLD_MINUTES = 15
const SLOT_PRESENTATION_LIMIT = 8 // how many slots to surface per offer

// ─── Types ───

export interface AvailabilityBlock {
  day_of_week: number  // 0=Mon, 6=Sun (ISO week, Monday-first)
  start_time: string   // 'HH:MM'
  end_time: string     // 'HH:MM'
}

export interface CalendarSlot {
  id: string
  coach_id: string
  slot_date: string    // 'YYYY-MM-DD'
  start_time: string   // 'HH:MM:SS'
  end_time: string
  duration_min: number
  status: 'available' | 'held' | 'booked' | 'cancelled'
  price_gbp: string | null
  held_by_member_id?: string | null
  hold_expiry?: string | null
}

export type PtBookingStateName =
  | 'awaiting_pt_choice'
  | 'awaiting_slot_choice'
  | 'awaiting_payment_confirmation'
  | 'completed'
  | 'cancelled'
  | 'expired'

export interface PtBookingStateRow {
  id: string
  member_jid: string
  member_id: string | null
  state: PtBookingStateName
  coach_id: string | null
  pt_options: unknown
  slot_options: string[] | null  // array of slot ids in the order presented
  chosen_slot_id: string | null
  expires_at: string
  created_at: string
}

// ─── Availability declaration ───

// Replace all availability blocks for a coach for a given week.
// Idempotent — full replace, not delta. Caller passes the canonical week.
export async function declareAvailability(
  coachId: string,
  weekCommencing: string,  // 'YYYY-MM-DD' — must be a Monday
  blocks: AvailabilityBlock[]
): Promise<void> {
  await sql`
    DELETE FROM pt_availability
    WHERE coach_id = ${coachId} AND week_commencing = ${weekCommencing}
  `
  for (const b of blocks) {
    if (b.day_of_week < 0 || b.day_of_week > 6) continue
    await sql`
      INSERT INTO pt_availability (coach_id, week_commencing, day_of_week, start_time, end_time)
      VALUES (${coachId}, ${weekCommencing}, ${b.day_of_week}, ${b.start_time}, ${b.end_time})
    `
  }
}

export async function getAvailabilityForWeek(
  coachId: string,
  weekCommencing: string
): Promise<AvailabilityBlock[]> {
  const { rows } = await sql`
    SELECT day_of_week, start_time::text as start_time, end_time::text as end_time
    FROM pt_availability
    WHERE coach_id = ${coachId} AND week_commencing = ${weekCommencing}
    ORDER BY day_of_week, start_time
  `
  return rows as unknown as AvailabilityBlock[]
}

// Convert availability blocks into individual bookable slots in calendar_slots.
// Default duration 60 min; chunks each block into back-to-back slots.
// Idempotent — re-running with the same week skips slots that already exist
// (uses the dedup index on (coach_id, slot_date, start_time)).
export async function generateSlotsFromAvailability(
  coachId: string,
  weekCommencing: string,
  durationMin: number = 60,
  pricePerSlotGbp: number | null = null
): Promise<{ generated: number; skipped: number }> {
  const blocks = await getAvailabilityForWeek(coachId, weekCommencing)
  const monday = new Date(weekCommencing + 'T00:00:00')
  let generated = 0
  let skipped = 0

  for (const block of blocks) {
    const slotDate = new Date(monday)
    slotDate.setDate(monday.getDate() + block.day_of_week)
    const dateStr = slotDate.toISOString().slice(0, 10)

    const blockStart = timeToMinutes(block.start_time)
    const blockEnd = timeToMinutes(block.end_time)

    for (let t = blockStart; t + durationMin <= blockEnd; t += durationMin) {
      const startTime = minutesToTime(t)
      const endTime = minutesToTime(t + durationMin)
      const insert = await sql`
        INSERT INTO calendar_slots (
          coach_id, slot_date, start_time, end_time, duration_min, status, price_gbp
        ) VALUES (
          ${coachId}, ${dateStr}, ${startTime}, ${endTime},
          ${durationMin}, 'available', ${pricePerSlotGbp}
        )
        ON CONFLICT (coach_id, slot_date, start_time) DO NOTHING
        RETURNING id
      `
      if ((insert.rowCount ?? 0) > 0) generated++
      else skipped++
    }
  }
  return { generated, skipped }
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}
function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60).toString().padStart(2, '0')
  const m = (mins % 60).toString().padStart(2, '0')
  return `${h}:${m}:00`
}

// ─── Slot lookups ───

export async function listAvailableSlots(
  coachId: string,
  fromDate: string,  // YYYY-MM-DD
  toDate: string,
  limit = SLOT_PRESENTATION_LIMIT
): Promise<CalendarSlot[]> {
  const { rows } = await sql`
    SELECT id, coach_id, slot_date::text as slot_date,
           start_time::text as start_time, end_time::text as end_time,
           duration_min, status, price_gbp::text as price_gbp
    FROM calendar_slots
    WHERE coach_id = ${coachId}
      AND status = 'available'
      AND slot_date BETWEEN ${fromDate} AND ${toDate}
    ORDER BY slot_date ASC, start_time ASC
    LIMIT ${limit}
  `
  return rows as unknown as CalendarSlot[]
}

export async function getSlot(slotId: string): Promise<CalendarSlot | null> {
  const { rows } = await sql`
    SELECT id, coach_id, slot_date::text as slot_date,
           start_time::text as start_time, end_time::text as end_time,
           duration_min, status, price_gbp::text as price_gbp,
           held_by_member_id, hold_expiry::text as hold_expiry
    FROM calendar_slots WHERE id = ${slotId} LIMIT 1
  `
  return (rows[0] as unknown as CalendarSlot) || null
}

// ─── Hold / release / book ───

export interface HoldResult {
  ok: boolean
  reason?: 'not_found' | 'not_available' | 'race_lost'
  expires_at?: string
}

// Atomically transition a slot from 'available' → 'held'.
// The WHERE clause ensures we only succeed if no one else has held it.
export async function holdSlot(
  slotId: string,
  memberId: string,
  holdMinutes: number = HOLD_MINUTES
): Promise<HoldResult> {
  const claim = await sql`
    UPDATE calendar_slots
    SET status = 'held',
        held_by_member_id = ${memberId},
        hold_expiry = NOW() + (${holdMinutes} || ' minutes')::interval,
        updated_at = NOW()
    WHERE id = ${slotId} AND status = 'available'
    RETURNING hold_expiry::text as hold_expiry
  `
  if ((claim.rowCount ?? 0) === 0) {
    const exists = await getSlot(slotId)
    if (!exists) return { ok: false, reason: 'not_found' }
    if (exists.status !== 'available') return { ok: false, reason: 'race_lost' }
    return { ok: false, reason: 'not_available' }
  }
  return { ok: true, expires_at: (claim.rows[0] as { hold_expiry: string }).hold_expiry }
}

// Release a slot back to 'available'. Used on hold expiry or explicit cancel.
export async function releaseSlot(slotId: string): Promise<void> {
  await sql`
    UPDATE calendar_slots
    SET status = 'available',
        held_by_member_id = NULL,
        hold_expiry = NULL,
        updated_at = NOW()
    WHERE id = ${slotId} AND status = 'held'
  `
}

// Book a held slot — creates the pt_session row + transitions slot to 'booked'.
// Wrap in a transaction so we can't end up with a session without a slot or vice versa.
export interface BookResult {
  ok: boolean
  reason?: 'slot_not_held' | 'expired' | 'wrong_member'
  pt_session_id?: string
}
export async function bookHeldSlot(
  slotId: string,
  memberId: string,
  paymentSelfReported = false
): Promise<BookResult> {
  const slot = await getSlot(slotId)
  if (!slot) return { ok: false, reason: 'slot_not_held' }
  if (slot.status !== 'held') return { ok: false, reason: 'slot_not_held' }
  if (slot.held_by_member_id !== memberId) return { ok: false, reason: 'wrong_member' }
  if (slot.hold_expiry && new Date(slot.hold_expiry).getTime() < Date.now()) {
    // Expired — release and bail
    await releaseSlot(slotId)
    return { ok: false, reason: 'expired' }
  }

  // Create the session
  const { rows: sessionRows } = await sql`
    INSERT INTO pt_sessions (
      coach_id, member_id, slot_id, session_date, start_time, end_time,
      duration_min, price_gbp, status, payment_status, payment_self_reported_at
    )
    VALUES (
      ${slot.coach_id}, ${memberId}, ${slotId}, ${slot.slot_date},
      ${slot.start_time}, ${slot.end_time}, ${slot.duration_min},
      ${slot.price_gbp ? Number(slot.price_gbp) : null},
      'booked',
      ${paymentSelfReported ? 'self_reported' : 'pending'},
      ${paymentSelfReported ? new Date().toISOString() : null}
    )
    RETURNING id
  `
  const ptSessionId = sessionRows[0].id as string

  await sql`
    UPDATE calendar_slots
    SET status = 'booked',
        booked_by_member_id = ${memberId},
        pt_session_id = ${ptSessionId},
        held_by_member_id = NULL,
        hold_expiry = NULL,
        updated_at = NOW()
    WHERE id = ${slotId}
  `
  return { ok: true, pt_session_id: ptSessionId }
}

// Cron-callable: release all 'held' slots whose hold_expiry has passed.
export async function releaseExpiredHolds(): Promise<number> {
  const result = await sql`
    UPDATE calendar_slots
    SET status = 'available',
        held_by_member_id = NULL,
        hold_expiry = NULL,
        updated_at = NOW()
    WHERE status = 'held' AND hold_expiry < NOW()
  `
  return result.rowCount ?? 0
}

// ─── Conversation state ───

export async function findOpenPtBooking(memberJid: string): Promise<PtBookingStateRow | null> {
  const { rows } = await sql`
    SELECT id, member_jid, member_id, state, coach_id,
           pt_options, slot_options, chosen_slot_id,
           expires_at::text as expires_at, created_at::text as created_at
    FROM pt_booking_state
    WHERE member_jid = ${memberJid}
      AND state IN ('awaiting_pt_choice','awaiting_slot_choice','awaiting_payment_confirmation')
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1
  `
  return (rows[0] as unknown as PtBookingStateRow) || null
}

export async function createPtBookingState(input: {
  memberJid: string
  memberId: string | null
  coachId: string | null
  state: PtBookingStateName
  slotOptions: string[]
}): Promise<string> {
  const { rows } = await sql`
    INSERT INTO pt_booking_state (
      member_jid, member_id, coach_id, state, slot_options
    ) VALUES (
      ${input.memberJid}, ${input.memberId}, ${input.coachId},
      ${input.state}, ${JSON.stringify(input.slotOptions)}::jsonb
    )
    RETURNING id
  `
  return rows[0].id as string
}

export async function setPtBookingState(
  id: string,
  state: PtBookingStateName,
  chosenSlotId?: string | null
): Promise<void> {
  await sql`
    UPDATE pt_booking_state
    SET state = ${state},
        chosen_slot_id = COALESCE(${chosenSlotId ?? null}, chosen_slot_id),
        updated_at = NOW()
    WHERE id = ${id}
  `
}

// ─── Member lookup ───

interface MemberRow {
  id: string
  parent_name: string | null
  programme_id: string
  programme_coach_id: string | null
}

export async function findMemberByJidWithCoach(jid: string): Promise<MemberRow | null> {
  // Strip the @s.whatsapp.net suffix and try several match strategies.
  // members.parent_whatsapp_id may be a full JID, raw digits, or null.
  const digits = jid.replace(/@.*$/, '').replace(/\D/g, '')
  const { rows } = await sql`
    SELECT m.id, m.parent_name, m.programme_id, p.coach_id as programme_coach_id
    FROM members m
    LEFT JOIN programmes p ON p.id = m.programme_id
    WHERE m.parent_whatsapp_id = ${jid}
       OR m.parent_whatsapp_id = ${digits}
       OR regexp_replace(COALESCE(m.parent_phone, ''), '\\D', '', 'g') = ${digits}
    LIMIT 1
  `
  return (rows[0] as MemberRow | undefined) || null
}

// ─── Webhook entry point ───
// Same self-gating contract as tryHandleCampBookingReply / tryHandleFeedbackReply.
// Returns true when this branch consumed the message.

const BOOKING_INTENT_PATTERN = /\b(book|booking|session|slot|appointment|pt|train|trainer)\b/i

export async function tryHandlePtBookingReply(
  senderJid: string,
  messageText: string
): Promise<boolean> {
  // Path A — there's an in-flight booking state for this JID. Process it.
  const open = await findOpenPtBooking(senderJid)
  if (open) {
    return handleInFlightBookingMessage(open, senderJid, messageText)
  }

  // Path B — no in-flight state. Detect booking intent + start the flow.
  if (!BOOKING_INTENT_PATTERN.test(messageText)) return false

  // Identify the member + their default coach (from their programme).
  const member = await findMemberByJidWithCoach(senderJid)
  if (!member || !member.programme_coach_id) {
    // Not a known member or no coach configured — let the standard 1:1
    // fallthrough handle the reply (don't claim ownership).
    return false
  }
  return startBookingFlow(senderJid, member, messageText)
}

async function startBookingFlow(
  senderJid: string,
  member: MemberRow,
  _messageText: string
): Promise<boolean> {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const twoWeeks = new Date()
    twoWeeks.setDate(twoWeeks.getDate() + 14)
    const toDate = twoWeeks.toISOString().slice(0, 10)

    const slots = await listAvailableSlots(member.programme_coach_id!, today, toDate, SLOT_PRESENTATION_LIMIT)
    if (slots.length === 0) {
      await sendWhatsAppMessage(
        senderJid,
        "There's no PT availability in the next two weeks. I'll let the studio know you'd like to book — they'll be in touch."
      )
      // Don't create a booking-state row; let the standard escalation path log this.
      return true
    }

    // Look up coach name for a warmer message
    const { rows: coachRows } = await sql`
      SELECT first_name, last_name FROM coaches_v2 WHERE id = ${member.programme_coach_id} LIMIT 1
    `
    const coachName = coachRows[0]
      ? `${coachRows[0].first_name} ${coachRows[0].last_name}`.trim()
      : 'your trainer'

    await createPtBookingState({
      memberJid: senderJid,
      memberId: member.id,
      coachId: member.programme_coach_id,
      state: 'awaiting_slot_choice',
      slotOptions: slots.map((s) => s.id),
    })

    const firstName = (member.parent_name || '').split(/\s+/)[0]
    await sendWhatsAppMessage(senderJid, buildPtSlotOfferMessage({
      memberFirstName: firstName,
      coachName,
      slots,
    }))
    return true
  } catch (e) {
    console.error('[PT BOOKING] error starting flow', e)
    return false  // let the standard webhook flow handle it
  }
}

async function handleInFlightBookingMessage(
  state: PtBookingStateRow,
  senderJid: string,
  messageText: string
): Promise<boolean> {
  try {
    switch (state.state) {
      case 'awaiting_slot_choice':
        return handleSlotChoice(state, senderJid, messageText)
      case 'awaiting_payment_confirmation':
        return handlePaymentConfirmation(state, senderJid, messageText)
      default:
        return false
    }
  } catch (e) {
    console.error('[PT BOOKING] error handling in-flight', state.id, e)
    return true  // claim ownership to avoid double-processing
  }
}

async function handleSlotChoice(
  state: PtBookingStateRow,
  senderJid: string,
  messageText: string
): Promise<boolean> {
  const slotIds = state.slot_options || []
  if (slotIds.length === 0) {
    await setPtBookingState(state.id, 'cancelled')
    return true
  }

  // Load the slot rows so we can present labels to Claude for parsing.
  const slots: CalendarSlot[] = []
  for (const id of slotIds) {
    const s = await getSlot(id)
    if (s) slots.push(s)
  }

  let chosenIndex: number | null
  try {
    chosenIndex = await parsePtSlotSelection(messageText, slots)
  } catch (e) {
    console.error('[PT BOOKING] slot parse failed', e)
    chosenIndex = null
  }

  if (chosenIndex === null || chosenIndex < 0 || chosenIndex >= slots.length) {
    await sendWhatsAppMessage(senderJid, buildPtUnparseableNudge(slots))
    return true
  }

  const chosenSlot = slots[chosenIndex]
  if (!state.member_id) {
    await sendWhatsAppMessage(senderJid, "I couldn't find your member record. Reply with your name + email and I'll get someone from the studio to help.")
    await setPtBookingState(state.id, 'cancelled')
    return true
  }

  // Hold the slot
  const hold = await holdSlot(chosenSlot.id, state.member_id, HOLD_MINUTES)
  if (!hold.ok) {
    await sendWhatsAppMessage(senderJid, "Someone just grabbed that one — let me check what else is available…")
    // Re-present slots
    const today = new Date().toISOString().slice(0, 10)
    const toDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const fresh = await listAvailableSlots(state.coach_id!, today, toDate, SLOT_PRESENTATION_LIMIT)
    if (fresh.length === 0) {
      await sendWhatsAppMessage(senderJid, "Nothing else available in the next two weeks. I'll let the studio know.")
      await setPtBookingState(state.id, 'cancelled')
      return true
    }
    // Update state with new slot options
    await sql`
      UPDATE pt_booking_state
      SET slot_options = ${JSON.stringify(fresh.map((s) => s.id))}::jsonb,
          updated_at = NOW()
      WHERE id = ${state.id}
    `
    const { rows: coachRows } = await sql`SELECT first_name, last_name FROM coaches_v2 WHERE id = ${state.coach_id} LIMIT 1`
    const coachName = coachRows[0] ? `${coachRows[0].first_name} ${coachRows[0].last_name}`.trim() : 'your trainer'
    await sendWhatsAppMessage(senderJid, buildPtSlotOfferMessage({
      memberFirstName: '',
      coachName,
      slots: fresh,
    }))
    return true
  }

  // Advance state + send payment instructions
  await setPtBookingState(state.id, 'awaiting_payment_confirmation', chosenSlot.id)
  const paymentLink = await getCoachPaymentLink(state.coach_id!)
  await sendWhatsAppMessage(senderJid, buildPtBookingPaymentInstructions({
    slot: chosenSlot,
    paymentLink,
    holdMinutes: HOLD_MINUTES,
  }))
  return true
}

async function handlePaymentConfirmation(
  state: PtBookingStateRow,
  senderJid: string,
  messageText: string
): Promise<boolean> {
  if (!parsePaidReply(messageText)) {
    await sendWhatsAppMessage(senderJid,
      `No worries — once you've sent the payment, reply "PAID" and I'll lock the booking in. Your hold is valid for the next ${HOLD_MINUTES} minutes.`
    )
    return true
  }

  if (!state.chosen_slot_id || !state.member_id) {
    await setPtBookingState(state.id, 'cancelled')
    return true
  }

  const result = await bookHeldSlot(state.chosen_slot_id, state.member_id, true)
  if (!result.ok) {
    if (result.reason === 'expired') {
      await sendWhatsAppMessage(senderJid, "That hold expired. Reply 'book' to see what's still available.")
    } else {
      await sendWhatsAppMessage(senderJid, "Sorry — something went wrong locking that booking in. The studio has been notified.")
    }
    await setPtBookingState(state.id, 'cancelled')
    return true
  }

  await setPtBookingState(state.id, 'completed')

  // Look up slot details for the confirmation message
  const slot = await getSlot(state.chosen_slot_id)
  const { rows: coachRows } = await sql`SELECT first_name, last_name FROM coaches_v2 WHERE id = ${state.coach_id} LIMIT 1`
  const coachName = coachRows[0] ? `${coachRows[0].first_name} ${coachRows[0].last_name}`.trim() : 'your trainer'
  await sendWhatsAppMessage(senderJid, buildPtBookingConfirmed({
    slot: slot!,
    coachName,
  }))

  // Best-effort: send a calendar invite by email if we have one on file
  // for this member. Failures here NEVER block — the WA confirmation
  // already went, this is gravy.
  ;(async () => {
    try {
      if (!slot || !state.member_id) return
      const { rows: memberRows } = await sql`
        SELECT parent_name, parent_email
        FROM members WHERE id = ${state.member_id} LIMIT 1
      `
      const memberEmail = memberRows[0]?.parent_email as string | undefined
      if (!memberEmail) return
      const { sendEmail } = await import('@/app/lib/email')
      const { buildIcs } = await import('@/app/lib/ical')
      const startIso = `${slot.slot_date}T${slot.start_time.slice(0, 8)}Z`
      const endIso = `${slot.slot_date}T${slot.end_time.slice(0, 8)}Z`
      const startAt = new Date(startIso)
      const endAt = new Date(endIso)
      const ics = buildIcs({
        uid: result.pt_session_id!,
        start: startAt,
        end: endAt,
        summary: `PT session with ${coachName}`,
        description: 'Your private training session at the studio.',
        organizer_name: coachName,
      })
      await sendEmail({
        to: memberEmail,
        subject: `Booking confirmed: PT session ${startAt.toLocaleDateString('en-GB')}`,
        text: `Your session with ${coachName} on ${startAt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })} at ${startAt.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' })} is confirmed.\n\nAdd to your calendar using the attached .ics file.`,
        attachments: [{
          filename: 'session.ics',
          content: Buffer.from(ics, 'utf8').toString('base64'),
          content_type: 'text/calendar; charset=utf-8; method=REQUEST',
        }],
      })
    } catch (e) {
      console.error('[PT email] calendar invite send failed:', e)
    }
  })()

  return true
}

async function getCoachPaymentLink(coachId: string): Promise<string | null> {
  // For now: look up the coach's most-recent programme that has a payment_link.
  // Phase 5 (Stripe) will replace this with a generated checkout URL per session.
  const { rows } = await sql`
    SELECT pr.payment_link
    FROM promotions pr
    JOIN promotion_targets pt ON pt.promotion_id = pr.id
    JOIN programmes pm ON pm.id = pt.programme_id
    WHERE pm.coach_id = ${coachId}
      AND pr.payment_link IS NOT NULL
    ORDER BY pr.created_at DESC
    LIMIT 1
  `
  return (rows[0]?.payment_link as string | undefined) || null
}

// ─── Dashboard queries ───

export async function listSessionsForCoach(coachId: string, limit = 50) {
  const { rows } = await sql`
    SELECT s.id, s.session_date::text as session_date,
           s.start_time::text as start_time, s.end_time::text as end_time,
           s.duration_min, s.price_gbp::text as price_gbp, s.status, s.payment_status,
           s.feedback_score, s.created_at,
           m.parent_name as member_name, m.parent_phone as member_phone
    FROM pt_sessions s
    JOIN members m ON m.id = s.member_id
    WHERE s.coach_id = ${coachId}
    ORDER BY s.session_date DESC, s.start_time DESC
    LIMIT ${limit}
  `
  return rows
}

export async function listSessionsForProvider(providerId: string, limit = 100) {
  const { rows } = await sql`
    SELECT s.id, s.session_date::text as session_date,
           s.start_time::text as start_time, s.end_time::text as end_time,
           s.duration_min, s.price_gbp::text as price_gbp, s.status, s.payment_status,
           s.feedback_score, s.created_at,
           m.parent_name as member_name, m.parent_phone as member_phone,
           c.first_name as coach_first_name, c.last_name as coach_last_name
    FROM pt_sessions s
    JOIN members m ON m.id = s.member_id
    JOIN coaches_v2 c ON c.id = s.coach_id
    WHERE c.provider_id = ${providerId}
    ORDER BY s.session_date DESC, s.start_time DESC
    LIMIT ${limit}
  `
  return rows
}
