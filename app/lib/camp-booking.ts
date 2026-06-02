// app/lib/camp-booking.ts
// Server-side engine for the WhatsApp-native holiday camp 1:1 booking flow.
//
// Revised spec — the full conversation after a parent opts in:
//   awaiting_parent_name → awaiting_child_name → awaiting_child_age
//     → awaiting_day_selection → awaiting_checkout_confirm
//     → awaiting_payment → awaiting_coach_confirm → confirmed
// plus awaiting_waitlist_confirm (all days full) and cancelled.
//
// Design decisions:
//  • We EXTEND the existing camp_bookings table rather than replace it. The
//    fine-grained position lives in `conversation_step`; the coarse `state`
//    column is kept in sync so the existing dashboard/confirm queries keep
//    working.
//  • Day capacity is DERIVED, not stored: remaining = capacity − count of
//    CONFIRMED bookings that include that day. No camp_days table needed, and
//    capacity only ever drops on coach confirmation (exactly the spec's rule).
//  • Multiple children share ONE payment via booking_group_id: one row per
//    child (so each consumes a day's capacity), grouped for recap/checkout/
//    payment/confirmation.
//
// SERVER-SIDE ONLY.

import { sql } from '@/app/lib/sql'
import { sendWhatsAppMessage } from '@/app/lib/evolution'
import {
  parseCampDaySelection,
  parseCampAge,
  parseCheckoutReply,
  parseAffirmative,
  buildCampOpening,
  buildCampAskChildName,
  buildCampAskAge,
  buildCampAgeRetry,
  buildCampDaySelection,
  buildCampAllFull,
  buildCampDayJustFilled,
  buildCampCheckoutRecap,
  buildCampPaymentMessage,
  buildCampPaidAck,
  buildCampWaitingOnCoach,
  buildCampConfirmed,
  buildCampRejected,
  buildCampDayUnparseableNudge,
  type CampDayAvailLite,
  type CampChildSummary,
} from '@/app/lib/ai-messages'

export interface CampDay {
  date: string
  label: string
  price_gbp: number
  capacity?: number | null
}

// Coarse state (kept for backward-compat with the dashboard + confirm route).
export type CampBookingState =
  | 'awaiting_day_selection'
  | 'awaiting_payment_confirmation'
  | 'paid_self_reported'
  | 'confirmed'
  | 'cancelled'
  | 'expired'

// Fine-grained conversation position (the new state machine driver).
export type CampStep =
  | 'awaiting_parent_name'
  | 'awaiting_child_name'
  | 'awaiting_child_age'
  | 'awaiting_day_selection'
  | 'awaiting_waitlist_confirm'
  | 'awaiting_checkout_confirm'
  | 'awaiting_payment'
  | 'awaiting_coach_confirm'
  | 'confirmed'
  | 'cancelled'

export interface CampBookingRow {
  id: string
  promotion_id: string
  booking_group_id: string | null
  member_id: string | null
  parent_jid: string
  parent_name: string | null
  child_name: string | null
  child_age: number | null
  days_selected: number[] | null
  total_gbp: string | null
  state: CampBookingState
  conversation_step: CampStep | null
  payment_status: string | null
  payment_link: string | null
  prompt_message_id: string | null
  expires_at: string
  created_at: string
  updated_at: string
}

export interface CampPromotionRow {
  id: string
  title: string | null
  detail: string
  venue: string | null
  payment_link: string | null
  camp_days: CampDay[] | null
  created_by: string
}

export interface CampDayAvailability {
  index: number
  day: CampDay
  confirmed: number
  remaining: number | null   // null = uncapped
  full: boolean
}

// Map a fine-grained step onto the coarse state the dashboard understands.
function stepToState(step: CampStep): CampBookingState {
  switch (step) {
    case 'awaiting_payment':
      return 'awaiting_payment_confirmation'
    case 'awaiting_coach_confirm':
      return 'paid_self_reported'
    case 'confirmed':
      return 'confirmed'
    case 'cancelled':
      return 'cancelled'
    default:
      // all collection + checkout + waitlist steps
      return 'awaiting_day_selection'
  }
}

const CAMP_SELECT = `
  id, promotion_id, booking_group_id, member_id, parent_jid, parent_name,
  child_name, child_age, days_selected, total_gbp::text as total_gbp, state,
  conversation_step, payment_status, payment_link, prompt_message_id,
  expires_at, created_at, updated_at
`

// ─── Lookups ───

// The active conversation row for a parent = the most recent row in an open
// group (any step except confirmed/cancelled), within its TTL.
export async function findOpenCampBooking(parentJid: string): Promise<CampBookingRow | null> {
  const { rows } = await sql.query(
    `SELECT ${CAMP_SELECT} FROM camp_bookings
     WHERE parent_jid = $1
       AND (conversation_step IS NULL OR conversation_step NOT IN ('confirmed','cancelled'))
       AND state NOT IN ('confirmed','cancelled','expired')
       AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [parentJid]
  )
  return (rows[0] as CampBookingRow | undefined) || null
}

export async function getCampPromotion(promotionId: string): Promise<CampPromotionRow | null> {
  const { rows } = await sql`
    SELECT id, title, detail, venue, payment_link, camp_days, created_by
    FROM promotions
    WHERE id = ${promotionId} AND promotion_type = 'holiday_camp'
    LIMIT 1
  `
  return (rows[0] as CampPromotionRow | undefined) || null
}

async function getGroupRows(bookingGroupId: string): Promise<CampBookingRow[]> {
  const { rows } = await sql.query(
    `SELECT ${CAMP_SELECT} FROM camp_bookings WHERE booking_group_id = $1 ORDER BY created_at ASC`,
    [bookingGroupId]
  )
  return rows as CampBookingRow[]
}

async function getCoachName(coachId: string): Promise<string | null> {
  try {
    const { rows } = await sql`SELECT first_name, last_name FROM coaches_v2 WHERE id = ${coachId} LIMIT 1`
    if (!rows[0]) return null
    return `${rows[0].first_name || ''} ${rows[0].last_name || ''}`.trim() || null
  } catch {
    return null
  }
}

// Live per-day availability. confirmed_count is derived from CONFIRMED bookings
// only — so capacity never drops until the coach confirms.
export async function getCampDayAvailability(promotionId: string): Promise<CampDayAvailability[]> {
  const promo = await getCampPromotion(promotionId)
  if (!promo || !Array.isArray(promo.camp_days) || promo.camp_days.length === 0) return []
  const days = promo.camp_days
  const { rows } = await sql`
    SELECT days_selected FROM camp_bookings
    WHERE promotion_id = ${promotionId} AND state = 'confirmed'
  `
  const counts = new Array(days.length).fill(0)
  for (const r of rows) {
    const sel: number[] = Array.isArray(r.days_selected)
      ? r.days_selected
      : r.days_selected
        ? JSON.parse(r.days_selected)
        : []
    for (const i of sel) if (i >= 0 && i < days.length) counts[i]++
  }
  return days.map((day, index) => {
    const capacity = day.capacity != null && Number(day.capacity) > 0 ? Number(day.capacity) : null
    const confirmed = counts[index]
    const remaining = capacity != null ? Math.max(0, capacity - confirmed) : null
    return { index, day, confirmed, remaining, full: remaining != null && remaining <= 0 }
  })
}

function toAvailLite(avail: CampDayAvailability[]): CampDayAvailLite[] {
  return avail
    .filter((a) => !a.full)
    .map((a) => ({ index: a.index, label: a.day.label, price_gbp: Number(a.day.price_gbp || 0), remaining: a.remaining }))
}

// Build CampChildSummary[] for every child in the group that has picked days.
function groupChildSummaries(group: CampBookingRow[], dayList: CampDay[]): CampChildSummary[] {
  const out: CampChildSummary[] = []
  for (const row of group) {
    const sel = row.days_selected
    if (!Array.isArray(sel) || sel.length === 0) continue
    const dayLabels = sel.filter((i) => i >= 0 && i < dayList.length).map((i) => dayList[i].label)
    const total = sel.reduce((s, i) => s + (i >= 0 && i < dayList.length ? Number(dayList[i].price_gbp || 0) : 0), 0)
    out.push({ childName: row.child_name || 'your child', age: row.child_age, dayLabels, total })
  }
  return out
}

// ─── Mutations ───

export async function createCampBooking(input: {
  promotionId: string
  memberId?: string | null
  parentJid: string
  parentName?: string | null
  childName?: string | null
  bookingGroupId?: string | null
  startStep?: CampStep
}): Promise<string> {
  // Default: if the child's name is already known (cohort-send path), skip
  // straight to day selection; otherwise begin the conversational collection.
  // A caller can override (e.g. the poll trigger starts at parent/child name).
  const step: CampStep = input.startStep || (input.childName ? 'awaiting_day_selection' : 'awaiting_child_name')
  const { rows } = await sql`
    INSERT INTO camp_bookings (
      promotion_id, member_id, parent_jid, parent_name, child_name,
      state, conversation_step
    ) VALUES (
      ${input.promotionId}, ${input.memberId || null}, ${input.parentJid},
      ${input.parentName || null}, ${input.childName || null},
      ${stepToState(step)}, ${step}
    )
    RETURNING id
  `
  const id = rows[0].id as string
  // Group id defaults to the row's own id unless joining an existing group.
  const groupId = input.bookingGroupId || id
  await sql`UPDATE camp_bookings SET booking_group_id = ${groupId} WHERE id = ${id}`
  return id
}

// Resolve a parent from their WhatsApp JID across the camp's target programmes,
// so a poll-triggered booking can pre-fill the name + link the member row.
async function findMemberByJid(jid: string): Promise<{ id: string; parent_name: string | null } | null> {
  const { rows } = await sql`
    SELECT id, parent_name FROM members
    WHERE parent_whatsapp_id = ${jid} AND status <> 'cancelled'
    ORDER BY created_at DESC LIMIT 1
  `
  return (rows[0] as { id: string; parent_name: string | null } | undefined) || null
}

// Start the 1:1 booking conversation from a poll YES. Idempotent: if the voter
// already has an open booking for this camp, we don't start a second one.
// Returns true when the camp opening was sent (so the caller skips its generic
// poll follow-up), false when the camp is misconfigured / already in progress.
export async function startCampBookingFromPoll(
  promotionId: string,
  voterJid: string,
  voterName?: string | null
): Promise<boolean> {
  const promo = await getCampPromotion(promotionId)
  if (!promo || !Array.isArray(promo.camp_days) || promo.camp_days.length === 0 || !promo.payment_link) {
    console.warn('[CAMP poll-trigger] promotion misconfigured, skipping:', promotionId)
    return false
  }

  // Idempotency — don't open a duplicate booking on a re-vote.
  const { rows: existing } = await sql`
    SELECT id FROM camp_bookings
    WHERE parent_jid = ${voterJid} AND promotion_id = ${promotionId}
      AND state NOT IN ('cancelled','expired')
    LIMIT 1
  `
  if (existing[0]) return true

  const member = await findMemberByJid(voterJid)
  const parentName = member?.parent_name || (voterName && voterName !== 'there' ? voterName : null)
  const parentFirst = parentName ? parentName.split(/\s+/)[0] : null
  const startStep: CampStep = parentName ? 'awaiting_child_name' : 'awaiting_parent_name'

  await createCampBooking({
    promotionId,
    parentJid: voterJid,
    parentName,
    memberId: member?.id || null,
    startStep,
  })
  await sendWhatsAppMessage(voterJid, buildCampOpening(promo.title || 'the camp', parentFirst))
  return true
}

async function setStep(id: string, step: CampStep) {
  await sql`
    UPDATE camp_bookings
    SET conversation_step = ${step}, state = ${stepToState(step)}, updated_at = NOW()
    WHERE id = ${id}
  `
}

async function setStepForGroup(
  bookingGroupId: string,
  step: CampStep,
  extra?: { paymentLink?: string | null; paymentStatus?: string }
) {
  await sql`
    UPDATE camp_bookings
    SET conversation_step = ${step},
        state = ${stepToState(step)},
        payment_link = COALESCE(${extra?.paymentLink ?? null}, payment_link),
        payment_status = COALESCE(${extra?.paymentStatus ?? null}, payment_status),
        payment_self_reported_at = CASE WHEN ${step === 'awaiting_coach_confirm'} THEN NOW() ELSE payment_self_reported_at END,
        updated_at = NOW()
    WHERE booking_group_id = ${bookingGroupId}
      AND conversation_step NOT IN ('confirmed','cancelled')
  `
}

async function setParentNameForGroup(bookingGroupId: string, parentName: string) {
  await sql`UPDATE camp_bookings SET parent_name = ${parentName}, updated_at = NOW() WHERE booking_group_id = ${bookingGroupId}`
}

async function setChildName(id: string, childName: string) {
  await sql`UPDATE camp_bookings SET child_name = ${childName}, updated_at = NOW() WHERE id = ${id}`
}

async function setChildAge(id: string, age: number) {
  await sql`UPDATE camp_bookings SET child_age = ${age}, updated_at = NOW() WHERE id = ${id}`
}

async function setBookingDays(id: string, dayIndices: number[], totalGbp: number) {
  await sql`
    UPDATE camp_bookings
    SET days_selected = ${JSON.stringify(dayIndices)}::jsonb, total_gbp = ${totalGbp}, updated_at = NOW()
    WHERE id = ${id}
  `
}

async function clearBookingDays(id: string) {
  await sql`UPDATE camp_bookings SET days_selected = NULL, total_gbp = NULL, updated_at = NOW() WHERE id = ${id}`
}

export async function markCampBookingPromptId(id: string, messageId: string | null) {
  if (!messageId) return
  await sql`UPDATE camp_bookings SET prompt_message_id = ${messageId}, updated_at = NOW() WHERE id = ${id}`
}

// Coach action: confirm the WHOLE group in one click, run all side-effects, and
// send the parent the single confirmation message. Capacity is derived, so just
// flipping these rows to 'confirmed' makes them count against day capacity.
export async function confirmCampBookingPayment(bookingId: string, coachId: string): Promise<void> {
  const { rows } = await sql.query(
    `SELECT booking_group_id, promotion_id, parent_jid FROM camp_bookings WHERE id = $1 LIMIT 1`,
    [bookingId]
  )
  if (!rows[0]) return
  const groupId: string = rows[0].booking_group_id || bookingId
  const promotionId: string = rows[0].promotion_id
  const parentJid: string = rows[0].parent_jid

  await sql`
    UPDATE camp_bookings
    SET state = 'confirmed', conversation_step = 'confirmed', payment_status = 'confirmed',
        payment_confirmed_at = NOW(), confirmed_by = ${coachId}, updated_at = NOW()
    WHERE booking_group_id = ${groupId} AND state <> 'confirmed'
  `
  // Linked members → active (was trial/interested).
  await sql`
    UPDATE members SET status = 'active'
    WHERE id IN (SELECT member_id FROM camp_bookings WHERE booking_group_id = ${groupId} AND member_id IS NOT NULL)
  `

  // Parent confirmation (Message 8). Best-effort — never throw out of confirm.
  try {
    const promo = await getCampPromotion(promotionId)
    const group = await getGroupRows(groupId)
    const dayList = promo?.camp_days || []
    const children = groupChildSummaries(group, dayList)
    if (children.length > 0) {
      await sendWhatsAppMessage(parentJid, buildCampConfirmed({ children, venue: promo?.venue || null }))
    }
  } catch (e) {
    console.error('[CAMP confirm] message send failed for group', groupId, e)
  }
}

// Coach action: reject a self-reported payment. Booking stays at
// awaiting_confirmation; parent is told the coach will be in touch.
export async function rejectCampBooking(bookingId: string, coachId: string): Promise<void> {
  const { rows } = await sql.query(
    `SELECT booking_group_id, parent_jid FROM camp_bookings WHERE id = $1 LIMIT 1`,
    [bookingId]
  )
  if (!rows[0]) return
  const groupId: string = rows[0].booking_group_id || bookingId
  const parentJid: string = rows[0].parent_jid
  await sql`
    UPDATE camp_bookings SET payment_status = 'rejected', updated_at = NOW()
    WHERE booking_group_id = ${groupId} AND state = 'paid_self_reported'
  `
  try {
    const coachName = await getCoachName(coachId)
    await sendWhatsAppMessage(parentJid, buildCampRejected(coachName))
  } catch (e) {
    console.error('[CAMP reject] message send failed for group', groupId, e)
  }
}

// ─── Parsers ───

export function parsePaidReply(text: string): boolean {
  const t = text.trim().toLowerCase()
  if (t.length === 0) return false
  return /^(paid|done|sent|transferred|payment sent|just paid|paid it|all paid|✅|👍 paid|paid 👍)\b/.test(t)
    || t === '✅'
    || t === '👍'
}

export function parseCancelReply(text: string): boolean {
  return /\b(cancel|cancelled|forget it|never mind|nevermind|pull out|withdraw)\b/i.test(text.trim())
}

// ─── Webhook entry point ───
// Returns true when this message was consumed by the camp flow.

export async function tryHandleCampBookingReply(
  senderJid: string,
  messageText: string
): Promise<boolean> {
  const booking = await findOpenCampBooking(senderJid)
  if (!booking) return false

  const groupId = booking.booking_group_id || booking.id
  const parentFirst = (booking.parent_name || '').split(/\s+/)[0] || ''
  const childName = booking.child_name || 'your child'

  try {
    const promo = await getCampPromotion(booking.promotion_id)
    if (!promo || !Array.isArray(promo.camp_days) || promo.camp_days.length === 0) {
      console.error('[CAMP] booking', booking.id, 'has no camp_days on promotion', booking.promotion_id)
      await setStep(booking.id, 'cancelled')
      return false
    }
    const dayList: CampDay[] = promo.camp_days
    const campName = promo.title || 'the camp'
    const step: CampStep = booking.conversation_step || 'awaiting_day_selection'

    // Global cancel — only meaningful pre-confirmation, and only once there's a
    // priced booking on the table (avoids "cancel" being read as a name/age).
    if (parseCancelReply(messageText) && (step === 'awaiting_payment' || step === 'awaiting_checkout_confirm')) {
      await sql`UPDATE camp_bookings SET state = 'cancelled', conversation_step = 'cancelled', updated_at = NOW() WHERE booking_group_id = ${groupId} AND state <> 'confirmed'`
      await sendWhatsAppMessage(senderJid, `No problem — I've cancelled that booking. Just message me here if you change your mind. 👍`)
      return true
    }

    switch (step) {
      case 'awaiting_parent_name': {
        const name = messageText.trim()
        if (!name) { await sendWhatsAppMessage(senderJid, `Sorry, what's your name?`); return true }
        await setParentNameForGroup(groupId, name)
        await setStep(booking.id, 'awaiting_child_name')
        await sendWhatsAppMessage(senderJid, buildCampAskChildName(name.split(/\s+/)[0]))
        return true
      }

      case 'awaiting_child_name': {
        const name = messageText.trim()
        if (!name) { await sendWhatsAppMessage(senderJid, `What's your child's first name?`); return true }
        await setChildName(booking.id, name)
        await setStep(booking.id, 'awaiting_child_age')
        await sendWhatsAppMessage(senderJid, buildCampAskAge(name))
        return true
      }

      case 'awaiting_child_age': {
        const age = parseCampAge(messageText)
        if (age == null) { await sendWhatsAppMessage(senderJid, buildCampAgeRetry(childName)); return true }
        await setChildAge(booking.id, age)
        const avail = await getCampDayAvailability(booking.promotion_id)
        const open = toAvailLite(avail)
        if (open.length === 0) {
          await setStep(booking.id, 'awaiting_waitlist_confirm')
          await sendWhatsAppMessage(senderJid, buildCampAllFull(campName))
          return true
        }
        await setStep(booking.id, 'awaiting_day_selection')
        await sendWhatsAppMessage(senderJid, buildCampDaySelection(childName, campName, open))
        return true
      }

      case 'awaiting_waitlist_confirm': {
        if (parseAffirmative(messageText)) {
          if (booking.member_id) {
            await sql`UPDATE members SET status = 'waitlisted' WHERE id = ${booking.member_id}`
          }
          await sql`UPDATE camp_bookings SET state = 'cancelled', conversation_step = 'cancelled', updated_at = NOW() WHERE id = ${booking.id}`
          await sendWhatsAppMessage(senderJid, `Done — I've added you to the waitlist for ${campName}. I'll message you the moment a spot opens up. 👍`)
        } else {
          await sql`UPDATE camp_bookings SET state = 'cancelled', conversation_step = 'cancelled', updated_at = NOW() WHERE id = ${booking.id}`
          await sendWhatsAppMessage(senderJid, `No worries — maybe next time! Message me here if anything changes.`)
        }
        return true
      }

      case 'awaiting_day_selection': {
        let indices: number[] | null
        try {
          indices = await parseCampDaySelection(messageText, dayList)
        } catch (e) {
          console.error('[CAMP] day-parse error for booking', booking.id, e)
          indices = null
        }
        if (!indices || indices.length === 0) {
          await sendWhatsAppMessage(senderJid, buildCampDayUnparseableNudge(childName, dayList))
          return true
        }
        const clean = Array.from(new Set(indices.filter((i) => i >= 0 && i < dayList.length))).sort((a, b) => a - b)
        // Re-check capacity: drop any day that has since filled.
        const avail = await getCampDayAvailability(booking.promotion_id)
        const fullSet = new Set(avail.filter((a) => a.full).map((a) => a.index))
        const filledPick = clean.filter((i) => fullSet.has(i))
        const usable = clean.filter((i) => !fullSet.has(i))
        if (usable.length === 0 || filledPick.length > 0) {
          const open = toAvailLite(avail)
          const filledLabel = filledPick.length > 0 ? dayList[filledPick[0]].label : 'that day'
          await sendWhatsAppMessage(senderJid, buildCampDayJustFilled(filledLabel, open))
          return true
        }
        const total = usable.reduce((s, i) => s + Number(dayList[i].price_gbp || 0), 0)
        await setBookingDays(booking.id, usable, total)
        await setStep(booking.id, 'awaiting_checkout_confirm')
        const group = await getGroupRows(groupId)
        await sendWhatsAppMessage(senderJid, buildCampCheckoutRecap(groupChildSummaries(group, dayList)))
        return true
      }

      case 'awaiting_checkout_confirm': {
        const reply = parseCheckoutReply(messageText)
        if (reply === 'add') {
          // New sibling row in the same group; collect from child name.
          await createCampBooking({
            promotionId: booking.promotion_id,
            parentJid: senderJid,
            parentName: booking.parent_name,
            bookingGroupId: groupId,
          })
          await sendWhatsAppMessage(senderJid, buildCampAskChildName(parentFirst))
          return true
        }
        if (reply === 'change') {
          await clearBookingDays(booking.id)
          await setStep(booking.id, 'awaiting_day_selection')
          const avail = await getCampDayAvailability(booking.promotion_id)
          await sendWhatsAppMessage(senderJid, buildCampDaySelection(childName, campName, toAvailLite(avail)))
          return true
        }
        if (reply === 'confirm') {
          // Final capacity re-check across the whole group.
          const avail = await getCampDayAvailability(booking.promotion_id)
          const fullSet = new Set(avail.filter((a) => a.full).map((a) => a.index))
          const group = await getGroupRows(groupId)
          for (const row of group) {
            const sel = Array.isArray(row.days_selected) ? row.days_selected : []
            const filled = sel.find((i) => fullSet.has(i))
            if (filled !== undefined) {
              const filledLabel = dayList[filled]?.label || 'a day'
              await clearBookingDays(row.id)
              await setStep(row.id, 'awaiting_day_selection')
              await sendWhatsAppMessage(senderJid, buildCampDayJustFilled(filledLabel, toAvailLite(avail)))
              return true
            }
          }
          await setStepForGroup(groupId, 'awaiting_payment', { paymentLink: promo.payment_link, paymentStatus: 'sent' })
          const children = groupChildSummaries(group, dayList)
          await sendWhatsAppMessage(
            senderJid,
            buildCampPaymentMessage({
              children,
              paymentLink: promo.payment_link,
              paymentReference: children.map((c) => c.childName).join(' & '),
              campName,
            })
          )
          return true
        }
        await sendWhatsAppMessage(senderJid, `Reply "yes" to get the payment link, "add" to book another child, or "change" to update the days.`)
        return true
      }

      case 'awaiting_payment': {
        if (!parsePaidReply(messageText)) {
          await sendWhatsAppMessage(
            senderJid,
            `No rush ${parentFirst || 'there'} — once you've sent the payment, just reply "done" and I'll let the coach know.`
          )
          return true
        }
        await setStepForGroup(groupId, 'awaiting_coach_confirm', { paymentStatus: 'awaiting_confirmation' })
        const group = await getGroupRows(groupId)
        const total = group.reduce((s, r) => s + Number(r.total_gbp || 0), 0)
        await sendWhatsAppMessage(senderJid, buildCampPaidAck({ parentFirstName: parentFirst, childName, total }))
        return true
      }

      case 'awaiting_coach_confirm': {
        const coachName = await getCoachName(promo.created_by)
        await sendWhatsAppMessage(senderJid, buildCampWaitingOnCoach(coachName))
        return true
      }

      default:
        return false
    }
  } catch (e) {
    console.error('[CAMP BOOKING] error for booking', booking.id, e)
    // Claim the message so the webhook doesn't double-handle it.
    return true
  }
}

// ─── Coach dashboard queries ───

export async function listCampBookingsForPromotion(promotionId: string) {
  const { rows } = await sql`
    SELECT cb.id, cb.booking_group_id, cb.parent_jid, cb.parent_name, cb.child_name,
           cb.child_age, cb.days_selected, cb.total_gbp::text as total_gbp, cb.state,
           cb.conversation_step, cb.payment_status,
           cb.payment_self_reported_at, cb.payment_confirmed_at,
           cb.created_at, cb.updated_at,
           m.parent_phone, m.parent_email
    FROM camp_bookings cb
    LEFT JOIN members m ON m.id = cb.member_id
    WHERE cb.promotion_id = ${promotionId}
    ORDER BY cb.created_at DESC
  `
  return rows
}

export async function listCampBookingsForCoach(coachId: string, limit = 50) {
  const { rows } = await sql`
    SELECT cb.id, cb.promotion_id, p.title as promotion_title,
           cb.parent_name, cb.child_name, cb.child_age, cb.days_selected,
           cb.total_gbp::text as total_gbp, cb.state, cb.conversation_step,
           cb.payment_self_reported_at, cb.payment_confirmed_at, cb.created_at
    FROM camp_bookings cb
    JOIN promotions p ON p.id = cb.promotion_id
    WHERE p.created_by = ${coachId}
    ORDER BY cb.created_at DESC
    LIMIT ${limit}
  `
  return rows
}

export async function getCampBookingForCoach(bookingId: string, coachId: string) {
  const { rows } = await sql`
    SELECT cb.id, cb.promotion_id, cb.parent_jid, cb.parent_name, cb.child_name,
           cb.child_age, cb.days_selected, cb.total_gbp::text as total_gbp, cb.state,
           cb.conversation_step, cb.payment_self_reported_at, cb.payment_confirmed_at, cb.created_at
    FROM camp_bookings cb
    JOIN promotions p ON p.id = cb.promotion_id
    WHERE cb.id = ${bookingId} AND p.created_by = ${coachId}
    LIMIT 1
  `
  return rows[0] || null
}
