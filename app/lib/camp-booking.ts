// app/lib/camp-booking.ts
// Server-side helpers for the WhatsApp-native holiday camp booking flow.
// One row per child-per-camp in camp_bookings. State machine:
//   awaiting_day_selection → awaiting_payment_confirmation
//                          → paid_self_reported (parent reports)
//                          → confirmed (coach reconciles)
// Mirrors the pending_feedback pattern. SERVER-SIDE ONLY.

import { sql } from '@vercel/postgres'
import { sendWhatsAppMessage } from '@/app/lib/evolution'
import {
  parseCampDaySelection,
  buildCampPaymentInstructions,
  buildCampPaidAck,
  buildCampDayUnparseableNudge,
} from '@/app/lib/ai-messages'

export interface CampDay {
  date: string         // 'YYYY-MM-DD'
  label: string        // 'Tue 7 Apr'
  price_gbp: number
  capacity?: number | null
}

export type CampBookingState =
  | 'awaiting_day_selection'
  | 'awaiting_payment_confirmation'
  | 'paid_self_reported'
  | 'confirmed'
  | 'cancelled'
  | 'expired'

export interface CampBookingRow {
  id: string
  promotion_id: string
  member_id: string | null
  parent_jid: string
  parent_name: string | null
  child_name: string | null
  days_selected: number[] | null
  total_gbp: string | null
  state: CampBookingState
  prompt_message_id: string | null
  expires_at: string
  payment_self_reported_at: string | null
  payment_confirmed_at: string | null
  created_at: string
  updated_at: string
}

export interface CampPromotionRow {
  id: string
  title: string | null
  detail: string
  payment_link: string | null
  camp_days: CampDay[] | null
  created_by: string
}

// ─── Lookups ───

// Oldest open booking for a parent JID. Multi-child parents progress through
// one booking at a time in created_at order; the most-recently-added child
// will only become active once the prior siblings have at least self-reported
// payment. Returns null when no open booking exists.
export async function findOpenCampBooking(parentJid: string): Promise<CampBookingRow | null> {
  const { rows } = await sql`
    SELECT id, promotion_id, member_id, parent_jid, parent_name, child_name,
           days_selected, total_gbp::text as total_gbp, state, prompt_message_id,
           expires_at, payment_self_reported_at, payment_confirmed_at,
           created_at, updated_at
    FROM camp_bookings
    WHERE parent_jid = ${parentJid}
      AND state IN ('awaiting_day_selection','awaiting_payment_confirmation')
      AND expires_at > NOW()
    ORDER BY created_at ASC
    LIMIT 1
  `
  return (rows[0] as CampBookingRow | undefined) || null
}

export async function getCampPromotion(promotionId: string): Promise<CampPromotionRow | null> {
  const { rows } = await sql`
    SELECT id, title, detail, payment_link, camp_days, created_by
    FROM promotions
    WHERE id = ${promotionId}
      AND promotion_type = 'holiday_camp'
    LIMIT 1
  `
  return (rows[0] as CampPromotionRow | undefined) || null
}

// ─── Mutations ───

export async function createCampBooking(input: {
  promotionId: string
  memberId?: string | null
  parentJid: string
  parentName?: string | null
  childName?: string | null
}): Promise<string> {
  const { rows } = await sql`
    INSERT INTO camp_bookings (
      promotion_id, member_id, parent_jid, parent_name, child_name
    ) VALUES (
      ${input.promotionId}, ${input.memberId || null}, ${input.parentJid},
      ${input.parentName || null}, ${input.childName || null}
    )
    RETURNING id
  `
  return rows[0].id as string
}

export async function setCampBookingState(id: string, state: CampBookingState) {
  await sql`
    UPDATE camp_bookings
    SET state = ${state}, updated_at = NOW()
    WHERE id = ${id}
  `
}

export async function setCampBookingDays(id: string, dayIndices: number[], totalGbp: number) {
  await sql`
    UPDATE camp_bookings
    SET days_selected = ${JSON.stringify(dayIndices)}::jsonb,
        total_gbp = ${totalGbp},
        updated_at = NOW()
    WHERE id = ${id}
  `
}

export async function markCampBookingPromptId(id: string, messageId: string | null) {
  if (!messageId) return
  await sql`
    UPDATE camp_bookings
    SET prompt_message_id = ${messageId}, updated_at = NOW()
    WHERE id = ${id}
  `
}

export async function markCampBookingPaidSelfReported(id: string) {
  await sql`
    UPDATE camp_bookings
    SET state = 'paid_self_reported',
        payment_self_reported_at = NOW(),
        updated_at = NOW()
    WHERE id = ${id}
  `
}

export async function confirmCampBookingPayment(id: string, coachId: string) {
  await sql`
    UPDATE camp_bookings
    SET state = 'confirmed',
        payment_confirmed_at = NOW(),
        confirmed_by = ${coachId},
        updated_at = NOW()
    WHERE id = ${id}
  `
}

// ─── Parsers ───

// "PAID" / "paid" / "done" / "sent" / "transferred" / ✅ / 👍
// Intentionally narrow — we don't want a random message after payment
// instructions ("ok thanks") to be treated as confirmation.
export function parsePaidReply(text: string): boolean {
  const t = text.trim().toLowerCase()
  if (t.length === 0) return false
  return /^(paid|done|sent|transferred|payment sent|just paid|paid it|all paid|✅|👍 paid|paid 👍)\b/.test(t)
    || t === '✅'
    || t === '👍'
}

// ─── Webhook entry point ───
// Returns true when this message was consumed by the camp flow. Webhook
// should stop further processing on `true`. Returns false when there's no
// open booking for this sender — webhook falls through to its normal logic.

export async function tryHandleCampBookingReply(
  senderJid: string,
  messageText: string
): Promise<boolean> {
  const booking = await findOpenCampBooking(senderJid)
  if (!booking) return false

  const childName = booking.child_name || 'your child'
  const parentFirstName = (booking.parent_name || '').split(/\s+/)[0] || ''

  try {
    const promo = await getCampPromotion(booking.promotion_id)
    if (!promo || !promo.camp_days || promo.camp_days.length === 0) {
      // Misconfigured camp — abort this booking so it doesn't trap the parent.
      console.error('[CAMP] booking', booking.id, 'has no camp_days on promotion', booking.promotion_id)
      await setCampBookingState(booking.id, 'cancelled')
      return false
    }
    const dayList: CampDay[] = promo.camp_days

    switch (booking.state) {
      case 'awaiting_day_selection': {
        // Use Claude to parse the free-text day selection into indices.
        let indices: number[] | null
        try {
          indices = await parseCampDaySelection(messageText, dayList)
        } catch (e) {
          console.error('[CAMP] day-parse error for booking', booking.id, e)
          indices = null
        }
        if (!indices || indices.length === 0) {
          await sendWhatsAppMessage(
            senderJid,
            buildCampDayUnparseableNudge(childName, dayList)
          )
          return true
        }
        // Sanity-clip + dedupe + sort.
        const clean = Array.from(new Set(indices.filter((i) => i >= 0 && i < dayList.length))).sort((a, b) => a - b)
        if (clean.length === 0) {
          await sendWhatsAppMessage(
            senderJid,
            buildCampDayUnparseableNudge(childName, dayList)
          )
          return true
        }
        const total = clean.reduce((sum, i) => sum + Number(dayList[i].price_gbp || 0), 0)
        await setCampBookingDays(booking.id, clean, total)
        await setCampBookingState(booking.id, 'awaiting_payment_confirmation')
        await sendWhatsAppMessage(
          senderJid,
          buildCampPaymentInstructions({
            parentFirstName,
            childName,
            selectedDays: clean.map((i) => dayList[i]),
            total,
            paymentLink: promo.payment_link,
            paymentReference: childName,
          })
        )
        return true
      }

      case 'awaiting_payment_confirmation': {
        if (!parsePaidReply(messageText)) {
          // Not "PAID" — soft nudge, stay in same state.
          await sendWhatsAppMessage(
            senderJid,
            `No worries ${parentFirstName || 'there'} — once you've sent the £${Number(booking.total_gbp || 0).toFixed(2)} for ${childName}, just reply "PAID" and I'll let the coach know.`
          )
          return true
        }
        await markCampBookingPaidSelfReported(booking.id)
        await sendWhatsAppMessage(
          senderJid,
          buildCampPaidAck({
            parentFirstName,
            childName,
            total: Number(booking.total_gbp || 0),
          })
        )
        return true
      }

      default:
        return false
    }
  } catch (e) {
    console.error('[CAMP BOOKING] error for booking', booking.id, e)
    // Claim ownership so the webhook doesn't double-process by falling
    // through into the group/general handler. Operator gets the log line.
    return true
  }
}

// ─── Coach dashboard queries ───

export async function listCampBookingsForPromotion(promotionId: string) {
  const { rows } = await sql`
    SELECT cb.id, cb.parent_jid, cb.parent_name, cb.child_name,
           cb.days_selected, cb.total_gbp::text as total_gbp, cb.state,
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
           cb.parent_name, cb.child_name, cb.days_selected,
           cb.total_gbp::text as total_gbp, cb.state,
           cb.payment_self_reported_at, cb.payment_confirmed_at,
           cb.created_at
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
           cb.days_selected, cb.total_gbp::text as total_gbp, cb.state,
           cb.payment_self_reported_at, cb.payment_confirmed_at, cb.created_at
    FROM camp_bookings cb
    JOIN promotions p ON p.id = cb.promotion_id
    WHERE cb.id = ${bookingId} AND p.created_by = ${coachId}
    LIMIT 1
  `
  return rows[0] || null
}
