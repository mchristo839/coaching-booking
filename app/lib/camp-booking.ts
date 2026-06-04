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
import { sendWhatsAppMessage, sendWhatsAppButtons } from '@/app/lib/evolution'
import { createMember, getProgramWithKbById, getProgrammeAvailability, type Knowledgebase } from '@/app/lib/db'
import { classifyBotIntent, planBotResponse, phraseAnswer } from '@/app/lib/bot-intent'
import { matchActiveFaq } from '@/app/lib/faq-learning'
import { getInternalRecipients } from '@/app/lib/notify'
import {
  parseCampDaySelection,
  parseCampDayLetters,
  parseCampAge,
  parseCheckoutReply,
  parseAffirmative,
  isValidEmail,
  parsePhoneNumber,
  buildCampOpening,
  buildCampAskChildName,
  buildCampAskAge,
  buildCampAgeRetry,
  buildCampDaySelection,
  buildCampAllFull,
  buildCampDayJustFilled,
  buildCampCheckoutRecap,
  buildCampAskRegName,
  buildCampAskRegEmail,
  buildCampAskRegPhone,
  buildCampRegEmailRetry,
  buildCampRegPhoneRetry,
  buildCampPaymentMessage,
  buildCampPaymentReceived,
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
  | 'awaiting_reg_name'
  | 'awaiting_reg_email'
  | 'awaiting_reg_phone'
  | 'awaiting_payment'
  | 'awaiting_coach_confirm'
  | 'confirmed'
  | 'cancelled'

export interface CampBookingRow {
  id: string
  promotion_id: string
  booking_group_id: string | null
  member_id: string | null
  programme_id: string | null
  parent_jid: string
  parent_name: string | null
  parent_email: string | null
  parent_phone: string | null
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
  id, promotion_id, booking_group_id, member_id, programme_id, parent_jid, parent_name,
  parent_email, parent_phone, child_name, child_age, days_selected,
  total_gbp::text as total_gbp, state, conversation_step, payment_status, payment_link,
  prompt_message_id, expires_at, created_at, updated_at
`

// ─── Lookups ───

// The active conversation row for a parent = the most recently UPDATED open row
// (any step except confirmed/cancelled), within its TTL. Ordering by updated_at
// (not created_at) means the booking the parent is actively progressing — e.g.
// the one we just sent the payment link for — is the one their next reply lands
// on, never a stale row.
export async function findOpenCampBooking(parentJid: string): Promise<CampBookingRow | null> {
  const { rows } = await sql.query(
    `SELECT ${CAMP_SELECT} FROM camp_bookings
     WHERE parent_jid = $1
       AND (conversation_step IS NULL OR conversation_step NOT IN ('confirmed','cancelled'))
       AND state NOT IN ('confirmed','cancelled','expired')
       AND expires_at > NOW()
     ORDER BY updated_at DESC
     LIMIT 1`,
    [parentJid]
  )
  return (rows[0] as CampBookingRow | undefined) || null
}

function firstWord(s: string | null | undefined): string {
  return (s || '').trim().split(/\s+/)[0].toLowerCase()
}

// Digits of a JID's user part (before @, before any :device suffix). For a
// phone JID this is the phone number; for a @lid it's the (unrelated) lid number.
function jidDigits(jid: string): string {
  return (jid || '').split('@')[0].split(':')[0].replace(/\D/g, '')
}

async function adoptBooking(row: CampBookingRow, senderJid: string, why: string): Promise<CampBookingRow> {
  await sql`UPDATE camp_bookings SET parent_jid = ${senderJid}, updated_at = NOW() WHERE id = ${row.id}`
  console.log(`[CAMP] adopted booking ${row.id}: ${row.parent_jid} → ${senderJid} (${why})`)
  row.parent_jid = senderJid
  return row
}

// Find the active booking for a 1:1 reply, bridging WhatsApp's identity quirks.
//
// Two problems this handles:
//  (B) Phone-JID format drift — the stored jid and the reply jid are the same
//      number but differ in form (@c.us vs @s.whatsapp.net, a :device suffix).
//      Matched on phone digits and re-keyed.
//  (A) LID↔phone — a parent who votes on a GROUP poll is only known by their
//      group @lid, but their 1:1 replies come from their phone jid. On the first
//      reply we adopt a recent open lid-keyed booking and re-key it. We prefer a
//      unique WhatsApp-name match; failing that, if there's exactly one open
//      lid booking we adopt it. Ambiguous (multiple, no name match) → skip.
// Selection across candidates is by most-recent ACTIVITY (updated_at): the
// booking the parent is actually progressing wins, so neither a stale
// collection row nor a stuck payment row can shadow the live conversation.

// Choose which open @lid booking to adopt for a phone reply (name match, or a
// single lid = same person, or a sole open lid booking). Returns null when
// genuinely ambiguous.
async function pickAdoptableLidBooking(senderName?: string | null): Promise<CampBookingRow | null> {
  // Only ever adopt on a confident WhatsApp-NAME match, and NEVER across coaches.
  // A 1:1 DM carries no group/coach context, so without a name we can't safely
  // tell whose booking it is — and crossing coaches would be a data-isolation
  // breach. So: no name → no adoption; same-named bookings under >1 coach → refuse.
  const name = firstWord(senderName)
  if (!name || name === 'there') return null

  const { rows } = await sql.query(
    `SELECT cb.id, cb.promotion_id, cb.booking_group_id, cb.member_id, cb.programme_id,
            cb.parent_jid, cb.parent_name, cb.parent_email, cb.parent_phone, cb.child_name,
            cb.child_age, cb.days_selected, cb.total_gbp::text as total_gbp, cb.state,
            cb.conversation_step, cb.payment_status, cb.payment_link, cb.prompt_message_id,
            cb.expires_at, cb.created_at, cb.updated_at,
            p.created_by AS coach_id
     FROM camp_bookings cb
     JOIN promotions p ON p.id = cb.promotion_id
     WHERE cb.parent_jid LIKE '%@lid'
       AND cb.conversation_step IN ('awaiting_parent_name','awaiting_child_name')
       AND cb.state NOT IN ('confirmed','cancelled','expired')
       AND cb.expires_at > NOW()
       AND cb.created_at > NOW() - INTERVAL '6 hours'
     ORDER BY cb.created_at DESC`,
    []
  )
  const open = rows as (CampBookingRow & { coach_id: string })[]
  const named = open.filter((r) => firstWord(r.parent_name) === name)
  if (named.length === 0) return null

  // SAFETY: if the name matches bookings under more than one coach, we cannot
  // tell which coach this DM belongs to — refuse rather than risk a cross-coach mix.
  if (new Set(named.map((r) => r.coach_id)).size > 1) {
    console.warn(`[CAMP] adoption refused — name "${name}" matches bookings under multiple coaches`)
    return null
  }
  if (named.length === 1) return named[0]
  // Several same-named bookings under ONE coach: only safe if they're the same
  // person (one lid). Otherwise ambiguous → refuse.
  if (new Set(named.map((r) => r.parent_jid)).size === 1) return named[0]
  console.log(`[CAMP] adoption ambiguous: ${named.length} "${name}" bookings, one coach, different people — not adopting`)
  return null
}

export async function findOrAdoptOpenCampBooking(
  senderJid: string,
  senderName?: string | null
): Promise<CampBookingRow | null> {
  const senderIsLid = senderJid.endsWith('@lid')
  const digits = jidDigits(senderJid)
  const candidates: { row: CampBookingRow; needsAdopt: boolean }[] = []

  // Exact JID match.
  const exact = await findOpenCampBooking(senderJid)
  if (exact) candidates.push({ row: exact, needsAdopt: false })

  // (B) Same phone number, different JID format (@c.us vs @s.whatsapp.net, :device).
  if (!senderIsLid && digits.length >= 6) {
    const { rows } = await sql.query(
      `SELECT ${CAMP_SELECT} FROM camp_bookings
       WHERE parent_jid NOT LIKE '%@lid'
         AND regexp_replace(split_part(split_part(parent_jid, '@', 1), ':', 1), '\\D', '', 'g') = $1
         AND (conversation_step IS NULL OR conversation_step NOT IN ('confirmed','cancelled'))
         AND state NOT IN ('confirmed','cancelled','expired')
         AND expires_at > NOW()
       ORDER BY updated_at DESC LIMIT 1`,
      [digits]
    )
    const r = rows[0] as CampBookingRow | undefined
    if (r && !candidates.some((c) => c.row.id === r.id)) {
      candidates.push({ row: r, needsAdopt: r.parent_jid !== senderJid })
    }
  }

  // (A) LID bridge — a recent open @lid booking that's likely this person.
  if (!senderIsLid) {
    const lidPick = await pickAdoptableLidBooking(senderName)
    if (lidPick && !candidates.some((c) => c.row.id === lidPick.id)) {
      candidates.push({ row: lidPick, needsAdopt: true })
    }
  }

  if (candidates.length === 0) return null

  // Pick the booking with the most recent activity (updated_at) — i.e. the one
  // the parent is genuinely mid-conversation on. This stops a stale collection
  // row from eating a "done" meant for the active payment booking, and equally
  // stops a stuck payment row from shadowing a fresh conversation.
  candidates.sort(
    (a, b) => new Date(b.row.updated_at).getTime() - new Date(a.row.updated_at).getTime()
  )
  const best = candidates[0]
  return best.needsAdopt ? adoptBooking(best.row, senderJid, 'best active booking') : best.row
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
  programmeId?: string | null
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
      promotion_id, programme_id, member_id, parent_jid, parent_name, child_name,
      state, conversation_step
    ) VALUES (
      ${input.promotionId}, ${input.programmeId || null}, ${input.memberId || null}, ${input.parentJid},
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
  voterName?: string | null,
  programmeId?: string | null
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
    programmeId: programmeId || null,
    parentJid: voterJid,
    parentName,
    memberId: member?.id || null,
    startStep,
  })
  await sendWhatsAppMessage(voterJid, buildCampOpening(promo.title || 'the camp', parentFirst))
  return true
}

// Resolve the programme to register a member under: the booking's own
// programme_id if known, else the camp promotion's first target programme.
async function resolveProgrammeId(promotionId: string, bookingProgrammeId: string | null): Promise<string | null> {
  if (bookingProgrammeId) return bookingProgrammeId
  const { rows } = await sql`SELECT programme_id FROM promotion_targets WHERE promotion_id = ${promotionId} LIMIT 1`
  return (rows[0]?.programme_id as string | undefined) || null
}

// Create/link a member row per child in the group (status 'trial'), so the
// family shows up on the Members page. Idempotent-ish: only creates for rows
// that don't already have a member_id.
async function ensureMemberForBooking(row: CampBookingRow, promotionId: string): Promise<void> {
  const programmeId = await resolveProgrammeId(promotionId, row.programme_id)
  if (!programmeId) { console.warn('[CAMP] cannot register member — no programme for booking', row.id); return }
  try {
    if (row.member_id) {
      // Enrich the existing member as more details come in (email/phone/full name).
      await sql`
        UPDATE members SET
          parent_name = COALESCE(${row.parent_name}, parent_name),
          parent_email = COALESCE(${row.parent_email}, parent_email),
          parent_phone = COALESCE(${row.parent_phone}, parent_phone),
          child_name = COALESCE(${row.child_name}, child_name)
        WHERE id = ${row.member_id}`
      return
    }
    const member = await createMember({
      programmeId,
      parentName: row.parent_name || undefined,
      parentEmail: row.parent_email || undefined,
      parentWhatsappId: row.parent_jid,
      parentPhone: row.parent_phone || undefined,
      childName: row.child_name || undefined,
      status: 'trial',
    })
    await sql`UPDATE camp_bookings SET member_id = ${member.id} WHERE id = ${row.id}`
    row.member_id = member.id
  } catch (e) {
    console.error('[CAMP] ensureMemberForBooking failed for', row.id, e)
  }
}

// Create/enrich a member row per child in the group (status 'trial') so the
// family shows on the Members page. Idempotent — updates existing members.
async function registerGroupMembers(group: CampBookingRow[], promotionId: string): Promise<void> {
  for (const row of group) await ensureMemberForBooking(row, promotionId)
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

async function setParentEmailForGroup(bookingGroupId: string, email: string) {
  await sql`UPDATE camp_bookings SET parent_email = ${email}, updated_at = NOW() WHERE booking_group_id = ${bookingGroupId}`
}

async function setParentPhoneForGroup(bookingGroupId: string, phone: string) {
  await sql`UPDATE camp_bookings SET parent_phone = ${phone}, updated_at = NOW() WHERE booking_group_id = ${bookingGroupId}`
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

// ─── Mid-flow Q&A (spec: the payment bot also answers camp questions) ───
// The 1:1 booking bot can field questions about the camp at any point — drawing
// on the SAME programme knowledgebase + approved FAQs the group bot uses, plus
// the camp's own details — then re-prompts the current step so the parent can
// carry on where they left off.

// Conservative "is this a question?" heuristic. Deliberately narrow so it never
// mistakes a valid step answer (a name, an age, "Monday", "yes", "done") for a
// question. Callers only invoke the answer path when the step's own parser has
// already failed (or the step accepts free text, e.g. a name).
function looksLikeCampQuestion(text: string): boolean {
  const t = (text || '').trim().toLowerCase()
  if (t.length < 3) return false
  if (t.includes('?')) return true
  const infoKeywords =
    /\b(how much|cost|costs|price|prices|pay|payment|refund|when|what time|times?|where|location|address|venue|parking|bring|wear|kit|lunch|food|snack|drink|how old|age|how long|duration|start|starts|finish|finishes|end|ends|cancel)\b/
  const words = t.split(/\s+/).length
  if (infoKeywords.test(t) && words >= 2) return true
  // Generic multi-word question opener.
  if (/^(what|when|where|how|why|who|can|could|do|does|is|are|will|would|should)\b/.test(t) && words >= 3) return true
  return false
}

// The "carry on where you left off" re-prompt for the current step.
async function buildStepReprompt(
  booking: CampBookingRow,
  promo: CampPromotionRow,
  dayList: CampDay[],
  step: CampStep,
): Promise<string> {
  const childName = booking.child_name || 'your child'
  const campName = promo.title || 'the camp'
  switch (step) {
    case 'awaiting_parent_name':
      return `Now, back to your booking — what's your name?`
    case 'awaiting_child_name':
      return `Now, back to your booking — what's your child's first name?`
    case 'awaiting_child_age':
      return `Now, back to your booking — how old is ${childName}?`
    case 'awaiting_day_selection': {
      const avail = await getCampDayAvailability(booking.promotion_id)
      return buildCampDaySelection(childName, campName, toAvailLite(avail))
    }
    case 'awaiting_checkout_confirm': {
      const group = await getGroupRows(booking.booking_group_id || booking.id)
      return buildCampCheckoutRecap(groupChildSummaries(group, dayList))
    }
    case 'awaiting_reg_name':
      return buildCampAskRegName(childName)
    case 'awaiting_reg_email':
      return buildCampAskRegEmail()
    case 'awaiting_reg_phone':
      return buildCampAskRegPhone()
    case 'awaiting_payment': {
      const link = promo.payment_link ? `\n${promo.payment_link}` : ''
      return `Whenever you're ready, here's your payment link again:${link}\n\nReply "done" once you've paid and I'll let the coach know.`
    }
    case 'awaiting_coach_confirm':
      return buildCampWaitingOnCoach(await getCoachName(promo.created_by))
    default:
      return `Shall we carry on with your booking?`
  }
}

// Answer a question asked mid-booking, then re-prompt the current step. Returns
// true only when it could GENUINELY answer (the closed-intent gate answered, an
// approved FAQ matched, or the camp's own details cover it) — otherwise false,
// so the caller falls back to the normal step handling and nothing is hijacked.
async function answerCampQuestionMidFlow(
  booking: CampBookingRow,
  promo: CampPromotionRow,
  dayList: CampDay[],
  question: string,
  senderJid: string,
  step: CampStep,
): Promise<boolean> {
  try {
    const programmeId = await resolveProgrammeId(booking.promotion_id, booking.programme_id)
    if (!programmeId) return false
    const program = await getProgramWithKbById(programmeId)
    if (!program) return false
    const kb = program.knowledgebase as Knowledgebase

    const { intent } = await classifyBotIntent(question)
    if (intent === 'social') return false // greetings/chatter — let the step handle it

    // The camp's own specifics, so price/day/venue questions can be answered even
    // when the programme knowledgebase doesn't carry them.
    const campFactParts: string[] = []
    if (promo.detail) campFactParts.push(`Camp: ${promo.detail}`)
    if (promo.venue) campFactParts.push(`Venue: ${promo.venue}`)
    if (Array.isArray(promo.camp_days) && promo.camp_days.length) {
      campFactParts.push(
        'Days & prices: ' +
          promo.camp_days.map((d) => `${d.label} — £${Number(d.price_gbp || 0).toFixed(2)}`).join('; ')
      )
    }
    const campFacts = campFactParts.join('\n')

    const availability = intent === 'capacity_booking' ? await getProgrammeAvailability(program) : null
    const plan = planBotResponse(intent, kb, availability)

    let facts: string | null = null
    let allowVenueGeo = false
    if (plan.action === 'answer') {
      facts = campFacts ? `${plan.facts}\n${campFacts}` : plan.facts
      allowVenueGeo = plan.intent === 'location'
    } else {
      const faq =
        Array.isArray(kb.customFaqs) && kb.customFaqs.length ? await matchActiveFaq(question, kb.customFaqs) : null
      if (faq) {
        facts = campFacts ? `Coach's approved answer: ${faq.a}\n${campFacts}` : `Coach's approved answer: ${faq.a}`
      } else if (
        campFacts &&
        /\b(how much|cost|price|pay|when|what time|time|day|date|where|venue|location|address|how long|duration|start|finish|end|bring|wear|kit|age|old)\b/i.test(
          question
        )
      ) {
        // A camp-specific question we can answer straight from the camp details.
        facts = campFacts
      }
    }
    if (!facts) return false

    const answer = await phraseAnswer(question, facts, promo.title || program.program_name || 'the camp', { allowVenueGeo })
    const reprompt = await buildStepReprompt(booking, promo, dayList, step)
    await sendWhatsAppMessage(senderJid, `${answer}\n\n${reprompt}`)
    return true
  } catch (e) {
    console.error('[CAMP qna] failed for booking', booking.id, e)
    return false
  }
}

// ─── Webhook entry point ───
// Returns true when this message was consumed by the camp flow.

export async function tryHandleCampBookingReply(
  senderJid: string,
  messageText: string,
  senderName?: string | null
): Promise<boolean> {
  const booking = await findOrAdoptOpenCampBooking(senderJid, senderName)
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
        if (looksLikeCampQuestion(messageText) && await answerCampQuestionMidFlow(booking, promo, dayList, messageText, senderJid, step)) return true
        const name = messageText.trim()
        if (!name) { await sendWhatsAppMessage(senderJid, `Sorry, what's your name?`); return true }
        await setParentNameForGroup(groupId, name)
        await setStep(booking.id, 'awaiting_child_name')
        await sendWhatsAppMessage(senderJid, buildCampAskChildName(name.split(/\s+/)[0]))
        return true
      }

      case 'awaiting_child_name': {
        if (looksLikeCampQuestion(messageText) && await answerCampQuestionMidFlow(booking, promo, dayList, messageText, senderJid, step)) return true
        const name = messageText.trim()
        if (!name) { await sendWhatsAppMessage(senderJid, `What's your child's first name?`); return true }
        await setChildName(booking.id, name)
        // Store the client the moment we have a child name (enriched later).
        booking.child_name = name
        await ensureMemberForBooking(booking, booking.promotion_id)
        await setStep(booking.id, 'awaiting_child_age')
        await sendWhatsAppMessage(senderJid, buildCampAskAge(name))
        return true
      }

      case 'awaiting_child_age': {
        const age = parseCampAge(messageText)
        if (age == null) {
          if (looksLikeCampQuestion(messageText) && await answerCampQuestionMidFlow(booking, promo, dayList, messageText, senderJid, step)) return true
          await sendWhatsAppMessage(senderJid, buildCampAgeRetry(childName)); return true
        }
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
        // Fast, deterministic path for the documented reply style ("a", "a c",
        // "all", "1 3") — no LLM, so a letter reply ALWAYS gets an instant,
        // reliable response. Fall back to the LLM only for natural language.
        let indices: number[] | null = parseCampDayLetters(messageText, dayList.length)
        if (!indices) {
          try {
            indices = await parseCampDaySelection(messageText, dayList)
          } catch (e) {
            console.error('[CAMP] day-parse error for booking', booking.id, e)
            indices = null
          }
        }
        if (!indices || indices.length === 0) {
          if (looksLikeCampQuestion(messageText) && await answerCampQuestionMidFlow(booking, promo, dayList, messageText, senderJid, step)) return true
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
          // Days are locked in — collect the sign-up details before payment.
          await setStep(booking.id, 'awaiting_reg_name')
          await sendWhatsAppMessage(senderJid, buildCampAskRegName(childName))
          return true
        }
        if (looksLikeCampQuestion(messageText) && await answerCampQuestionMidFlow(booking, promo, dayList, messageText, senderJid, step)) return true
        await sendWhatsAppMessage(senderJid, `Reply "yes" to get the payment link, "add" to book another child, or "change" to update the days.`)
        return true
      }

      case 'awaiting_reg_name': {
        if (looksLikeCampQuestion(messageText) && await answerCampQuestionMidFlow(booking, promo, dayList, messageText, senderJid, step)) return true
        const name = messageText.trim()
        if (name.length < 2) { await sendWhatsAppMessage(senderJid, `Sorry, what's the parent/guardian's full name?`); return true }
        await setParentNameForGroup(groupId, name)
        await setStep(booking.id, 'awaiting_reg_email')
        await sendWhatsAppMessage(senderJid, buildCampAskRegEmail())
        return true
      }

      case 'awaiting_reg_email': {
        const email = isValidEmail(messageText)
        if (!email) {
          if (looksLikeCampQuestion(messageText) && await answerCampQuestionMidFlow(booking, promo, dayList, messageText, senderJid, step)) return true
          await sendWhatsAppMessage(senderJid, buildCampRegEmailRetry()); return true
        }
        await setParentEmailForGroup(groupId, email)
        await setStep(booking.id, 'awaiting_reg_phone')
        await sendWhatsAppMessage(senderJid, buildCampAskRegPhone())
        return true
      }

      case 'awaiting_reg_phone': {
        const phone = parsePhoneNumber(messageText)
        if (!phone) {
          if (looksLikeCampQuestion(messageText) && await answerCampQuestionMidFlow(booking, promo, dayList, messageText, senderJid, step)) return true
          await sendWhatsAppMessage(senderJid, buildCampRegPhoneRetry()); return true
        }
        await setParentPhoneForGroup(groupId, phone)
        // Register the family on the Members page, then send the payment link.
        const group = await getGroupRows(groupId)
        await registerGroupMembers(group, booking.promotion_id)
        await setStepForGroup(groupId, 'awaiting_payment', { paymentLink: promo.payment_link, paymentStatus: 'sent' })
        await sql`UPDATE camp_bookings SET payment_link_sent_at = NOW() WHERE booking_group_id = ${groupId} AND conversation_step = 'awaiting_payment'`
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

      case 'awaiting_payment': {
        if (!parsePaidReply(messageText)) {
          if (looksLikeCampQuestion(messageText) && await answerCampQuestionMidFlow(booking, promo, dayList, messageText, senderJid, step)) return true
          await sendWhatsAppMessage(
            senderJid,
            `No rush ${parentFirst || 'there'} — once you've sent the payment, just reply "done" and I'll let the coach know.`
          )
          return true
        }
        await setStepForGroup(groupId, 'awaiting_coach_confirm', { paymentStatus: 'awaiting_confirmation' })
        const group = await getGroupRows(groupId)
        // Richer WhatsApp thank-you/receipt the moment they report payment — with
        // the coach-will-confirm wording and the GDPR notice (per the spec).
        const payCoachName = await getCoachName(promo.created_by)
        await sendWhatsAppMessage(
          senderJid,
          buildCampPaymentReceived({
            parentFirstName: parentFirst || null,
            children: groupChildSummaries(group, dayList),
            campName,
            coachName: payCoachName,
          })
        )
        await sql`UPDATE camp_bookings SET thankyou_sent_at = NOW() WHERE booking_group_id = ${groupId}`
        // DM the coach a YES/NO confirm request (button + text fallback).
        try {
          await requestCoachPaymentConfirm(groupId, booking.promotion_id, booking.programme_id, promo, group, dayList)
        } catch (e) {
          console.error('[CAMP] coach confirm request failed for group', groupId, e)
        }
        return true
      }

      case 'awaiting_coach_confirm': {
        if (looksLikeCampQuestion(messageText) && await answerCampQuestionMidFlow(booking, promo, dayList, messageText, senderJid, step)) return true
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

// ─── 24h chase ladders (run by the daily payment-chase cron) ───
// Two ladders, tracked on camp_bookings (parent_chase_step / coach_chase_step):
//  • Parent hasn't paid the link → nudge the parent at +24h, +48h.
//  • Parent reported payment but the coach hasn't confirmed → remind the coach
//    at +24h, +48h, and reassure the parent once.

export interface CampChaseResult { parentNudged: number; coachReminded: number; errors: string[] }

export async function runCampChase(): Promise<CampChaseResult> {
  const result: CampChaseResult = { parentNudged: 0, coachReminded: 0, errors: [] }

  // ── Parent unpaid ──
  try {
    const { rows } = await sql`
      SELECT DISTINCT ON (booking_group_id)
             booking_group_id, parent_jid, parent_name, payment_link,
             payment_link_sent_at, parent_chase_step
      FROM camp_bookings
      WHERE conversation_step = 'awaiting_payment'
        AND payment_link_sent_at IS NOT NULL
        AND payment_link_sent_at < NOW() - INTERVAL '24 hours'
      ORDER BY booking_group_id, created_at ASC`
    for (const r of rows) {
      const first = (r.parent_name || '').split(/\s+/)[0] || ''
      const link = r.payment_link ? `\n${r.payment_link}` : ''
      const sentMs = r.payment_link_sent_at ? Date.now() - new Date(r.payment_link_sent_at).getTime() : 0
      const hours = sentMs / 36e5
      let step: string | null = null
      let msg = ''
      if (!r.parent_chase_step) {
        step = 'nudge_24h'
        msg = `Hi ${first || 'there'} — just a nudge that your camp spot isn't secured until payment's in. Here's the link again:${link}\n\nOnce done, reply "done" and I'll confirm your place.`
      } else if (r.parent_chase_step === 'nudge_24h' && hours >= 48) {
        step = 'nudge_48h'
        msg = `Hi ${first || 'there'} — last reminder on your camp booking. Spaces are limited, so to keep your place please pay here:${link}\n\nReply "done" once sorted. 🙏`
      }
      if (!step) continue
      try {
        await sendWhatsAppMessage(r.parent_jid, msg)
        await sql`UPDATE camp_bookings SET parent_chase_step = ${step}, updated_at = NOW() WHERE booking_group_id = ${r.booking_group_id}`
        result.parentNudged++
      } catch (e) { result.errors.push(`parent ${r.booking_group_id}: ${e instanceof Error ? e.message : String(e)}`) }
    }
  } catch (e) { result.errors.push(`parent query: ${e instanceof Error ? e.message : String(e)}`) }

  // ── Coach hasn't confirmed a reported payment ──
  try {
    const { rows } = await sql`
      SELECT DISTINCT ON (booking_group_id)
             booking_group_id, parent_jid, parent_name, child_name, promotion_id,
             programme_id, total_gbp::text AS total_gbp, payment_self_reported_at, coach_chase_step
      FROM camp_bookings
      WHERE conversation_step = 'awaiting_coach_confirm'
        AND payment_self_reported_at < NOW() - INTERVAL '24 hours'
      ORDER BY booking_group_id, created_at ASC`
    for (const r of rows) {
      const repMs = r.payment_self_reported_at ? Date.now() - new Date(r.payment_self_reported_at).getTime() : 0
      const hours = repMs / 36e5
      let step: string | null = null
      if (!r.coach_chase_step) step = 'remind_24h'
      else if (r.coach_chase_step === 'remind_24h' && hours >= 48) step = 'remind_48h'
      if (!step) continue

      const programmeId = await resolveProgrammeId(r.promotion_id, r.programme_id)
      let dmd = false
      if (programmeId) {
        try {
          const recipients = await getInternalRecipients(programmeId)
          const coachMsg = `⏳ Reminder: a camp payment from ${r.parent_name || 'a parent'} (${r.child_name || 'child'}) has been waiting for your confirmation for over 24h. Confirm it on the dashboard so they get their booking confirmation.`
          for (const rec of recipients) {
            if (rec.whatsappJid) { try { await sendWhatsAppMessage(rec.whatsappJid, coachMsg); dmd = true } catch { /* logged below via errors */ } }
          }
        } catch (e) { result.errors.push(`coach recipients ${r.booking_group_id}: ${e instanceof Error ? e.message : String(e)}`) }
      }
      // Reassure the parent once (on the first reminder only).
      if (step === 'remind_24h') {
        const first = (r.parent_name || '').split(/\s+/)[0] || 'there'
        try { await sendWhatsAppMessage(r.parent_jid, `Hi ${first} — just letting you know we're still confirming your payment. You'll get your booking confirmation here shortly. Thanks for your patience! 🙏`) } catch { /* non-fatal */ }
      }
      await sql`UPDATE camp_bookings SET coach_chase_step = ${step}, updated_at = NOW() WHERE booking_group_id = ${r.booking_group_id}`
      if (dmd) result.coachReminded++
    }
  } catch (e) { result.errors.push(`coach query: ${e instanceof Error ? e.message : String(e)}`) }

  return result
}

// ─── Coach payment confirmation over WhatsApp (button + text) ───

// DM each internal recipient a YES/NO confirm request when a parent reports
// payment. Buttons are attempted first (unreliable on Baileys) with a plain
// text fallback that's equally actionable.
async function requestCoachPaymentConfirm(
  groupId: string,
  promotionId: string,
  bookingProgrammeId: string | null,
  promo: CampPromotionRow,
  group: CampBookingRow[],
  dayList: CampDay[],
): Promise<void> {
  const programmeId = await resolveProgrammeId(promotionId, bookingProgrammeId)
  if (!programmeId) return
  const recipients = await getInternalRecipients(programmeId)
  const children = groupChildSummaries(group, dayList)
  const total = children.reduce((s, c) => s + c.total, 0)
  const parentName = group.find((r) => r.parent_name)?.parent_name || 'a parent'
  const items = children
    .map((c) => `• ${c.childName}${c.age != null ? ` (age ${c.age})` : ''} — ${c.dayLabels.join(', ')} — £${c.total.toFixed(2)}`)
    .join('\n')
  const text =
    `💷 Payment reported for ${promo.title || 'the camp'}\n\n` +
    `From: ${parentName}\n${items}\nTotal: £${total.toFixed(2)}\n\n` +
    `Has it landed in your account? Reply *YES* to confirm (the family gets booked in + notified) or *NO* if not.`
  for (const r of recipients) {
    if (!r.whatsappJid) continue
    try {
      await sendWhatsAppButtons(
        r.whatsappJid,
        text,
        [
          { id: 'camp_confirm_yes', text: 'YES — confirm' },
          { id: 'camp_confirm_no', text: 'NO — not yet' },
        ],
        'MyCoachingAssistant',
      )
    } catch {
      try { await sendWhatsAppMessage(r.whatsappJid, text) } catch (e) { console.error('[CAMP] coach confirm DM failed:', e) }
    }
  }
}

function parseCoachConfirmReply(text: string): 'yes' | 'no' | null {
  const t = (text || '').trim().toLowerCase()
  if (!t) return null
  if (t.includes('camp_confirm_yes') || /^(yes|y|confirm|confirmed|received|got it|paid|yep|✅|👍)\b/.test(t)) return 'yes'
  if (t.includes('camp_confirm_no') || /^(no|n|not yet|nope|reject|decline|❌)\b/.test(t)) return 'no'
  return null
}

// Coach 1:1 handler: a coach replying YES/NO (button or text) confirms/rejects
// the oldest pending camp payment for a camp they own. Self-gating — returns
// false unless the sender is a coach with a pending confirmation and a clear
// yes/no, so it can run high-priority in the webhook without hijacking.
export async function tryHandleCoachCampConfirm(senderJid: string, messageText: string): Promise<boolean> {
  const decision = parseCoachConfirmReply(messageText)
  if (!decision) return false
  const senderDigits = jidDigits(senderJid)
  if (senderDigits.length < 9) return false

  const { rows } = await sql`
    SELECT cb.id, cb.parent_name, cb.child_name, p.created_by as coach_id, c.mobile
    FROM camp_bookings cb
    JOIN promotions p ON p.id = cb.promotion_id
    JOIN coaches_v2 c ON c.id = p.created_by
    WHERE cb.conversation_step = 'awaiting_coach_confirm'
    ORDER BY cb.created_at ASC
  `
  // Match the owning coach by the last 9 phone digits (bridges 07… vs 447…).
  const tail = senderDigits.slice(-9)
  const mine = rows.find((r) => {
    const cd = String(r.mobile || '').replace(/\D/g, '')
    return cd.length >= 9 && cd.slice(-9) === tail
  })
  if (!mine) return false

  try {
    if (decision === 'yes') {
      await confirmCampBookingPayment(mine.id as string, mine.coach_id as string)
      await sendWhatsAppMessage(senderJid, `✅ Confirmed ${mine.parent_name || 'the parent'}'s payment — ${mine.child_name || 'the child'} is booked in and has been notified.`)
    } else {
      await rejectCampBooking(mine.id as string, mine.coach_id as string)
      await sendWhatsAppMessage(senderJid, `👍 Noted — I've let ${mine.parent_name || 'the parent'} know there's an issue to sort.`)
    }
  } catch (e) {
    console.error('[CAMP] coach confirm handling failed for', mine.id, e)
  }
  return true
}

// ─── Automatic cleanup of stuck bookings (run by the daily cron) ───
// Abandoned mid-sign-up (pre-payment) → expire after 12h of inactivity.
// Unpaid after the chase ladder → expire after 72h. Coach-pending bookings are
// left alone (the coach chase reminds them), and confirmed are never touched.
// This stops abandoned conversations piling up and interfering with new ones.
export interface CampCleanupResult { expired: number }

export async function runCampCleanup(): Promise<CampCleanupResult> {
  const { rows } = await sql`
    UPDATE camp_bookings
    SET state = 'expired', conversation_step = 'cancelled', updated_at = NOW()
    WHERE state NOT IN ('confirmed','cancelled','expired')
      AND COALESCE(conversation_step, 'awaiting_day_selection') <> 'awaiting_coach_confirm'
      AND (
        (COALESCE(conversation_step, 'collecting') <> 'awaiting_payment' AND updated_at < NOW() - INTERVAL '12 hours')
        OR (conversation_step = 'awaiting_payment' AND updated_at < NOW() - INTERVAL '72 hours')
      )
    RETURNING id`
  if (rows.length) console.log(`[CAMP cleanup] expired ${rows.length} stuck booking(s)`)
  return { expired: rows.length }
}

// ─── Route 2: bot offers a booking link after answering an enquiry ───

// The active bookable camp for a programme/group (most recent live holiday_camp
// promotion with days + a payment link). Null when there's nothing to book.
export async function getActiveCampForProgramme(programmeId: string): Promise<{ id: string; title: string | null } | null> {
  const { rows } = await sql`
    SELECT p.id, p.title
    FROM promotions p
    JOIN promotion_targets pt ON pt.promotion_id = p.id
    WHERE pt.programme_id = ${programmeId}
      AND p.promotion_type = 'holiday_camp'
      AND p.status <> 'cancelled'
      AND p.camp_days IS NOT NULL
      AND p.payment_link IS NOT NULL
    ORDER BY p.created_at DESC
    LIMIT 1
  `
  return rows[0] ? { id: rows[0].id as string, title: (rows[0].title as string) ?? null } : null
}

export async function recordCampOffer(groupJid: string, senderJid: string, promotionId: string): Promise<void> {
  await sql`
    INSERT INTO camp_offers (group_jid, sender_jid, promotion_id)
    VALUES (${groupJid}, ${senderJid}, ${promotionId})
    ON CONFLICT (group_jid, sender_jid)
      DO UPDATE SET promotion_id = EXCLUDED.promotion_id, offered_at = NOW()
  `
}

// Non-consuming check: has this parent already been offered/nudged in this group
// within the window? Used to keep the soft booking nudge ONE-TIME per parent
// (so it never reads as repetitive). Default window ~24h ≈ one conversation.
export async function hasRecentCampOffer(
  groupJid: string,
  senderJid: string,
  withinMinutes = 1440
): Promise<boolean> {
  const { rows } = await sql`
    SELECT 1 FROM camp_offers
    WHERE group_jid = ${groupJid} AND sender_jid = ${senderJid}
      AND offered_at > NOW() - (${withinMinutes}::int * INTERVAL '1 minute')
    LIMIT 1
  `
  return rows.length > 0
}

// Returns the offered promotion id if there's a fresh (<60min) offer for this
// sender, and clears it. Null otherwise.
export async function consumeRecentCampOffer(groupJid: string, senderJid: string): Promise<string | null> {
  const { rows } = await sql`
    SELECT promotion_id FROM camp_offers
    WHERE group_jid = ${groupJid} AND sender_jid = ${senderJid}
      AND offered_at > NOW() - INTERVAL '60 minutes'
    LIMIT 1
  `
  if (!rows[0]) return null
  await sql`DELETE FROM camp_offers WHERE group_jid = ${groupJid} AND sender_jid = ${senderJid}`
  return rows[0].promotion_id as string
}
