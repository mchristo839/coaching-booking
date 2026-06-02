// app/lib/control-centre-db.ts
// DB helpers for the Coach Control Centre features.
// Kept in a separate file so it's easy to see what's new vs legacy db.ts.
// SERVER-SIDE ONLY.

import { sql } from '@/app/lib/sql'
import { normalizeUkPhoneToJid } from '@/app/lib/feedback'

// ─── Promotions ───

export interface CampDayInput {
  date: string         // 'YYYY-MM-DD'
  label: string        // 'Tue 7 Apr'
  price_gbp: number
  capacity?: number | null
}

export interface PromotionCreateInput {
  createdBy: string
  promotionType: 'social_event' | 'refer_a_friend' | 'holiday_camp' | 'other'
  title?: string | null
  detail: string
  startAt?: string | null
  endAt?: string | null
  venue?: string | null
  costGbp?: number | null
  isFree?: boolean
  paymentLink?: string | null
  sendMode: 'all_groups' | 'selected_groups'
  generatedMessage?: string | null
  slug?: string | null
  programmeIds: string[]
  campDays?: CampDayInput[] | null
  campImageUrl?: string | null
}

export async function createPromotion(input: PromotionCreateInput) {
  const campDaysJson = input.campDays && input.campDays.length > 0
    ? JSON.stringify(input.campDays)
    : null
  const { rows } = await sql`
    INSERT INTO promotions (
      created_by, promotion_type, title, detail, start_at, end_at,
      venue, cost_gbp, is_free, payment_link, send_mode, generated_message, slug, camp_days, camp_image_url
    )
    VALUES (
      ${input.createdBy}, ${input.promotionType}, ${input.title ?? null}, ${input.detail},
      ${input.startAt ?? null}, ${input.endAt ?? null},
      ${input.venue ?? null}, ${input.costGbp ?? null}, ${input.isFree ?? false},
      ${input.paymentLink ?? null}, ${input.sendMode}, ${input.generatedMessage ?? null},
      ${input.slug ?? null}, ${campDaysJson}::jsonb, ${input.campImageUrl ?? null}
    )
    RETURNING *
  `
  const promotion = rows[0]

  for (const programmeId of input.programmeIds) {
    await sql`
      INSERT INTO promotion_targets (promotion_id, programme_id)
      VALUES (${promotion.id}, ${programmeId})
      ON CONFLICT DO NOTHING
    `
  }

  return promotion
}

export async function getPromotion(id: string) {
  const { rows } = await sql`SELECT * FROM promotions WHERE id = ${id} LIMIT 1`
  return rows[0] || null
}

export async function listPromotionsForCoach(coachId: string) {
  // Return promotions created by this coach OR targeting a programme they have authority over.
  // For simplicity we return created_by = coachId only; the Control Centre shows what the coach made.
  const { rows } = await sql`
    SELECT * FROM promotions WHERE created_by = ${coachId} ORDER BY created_at DESC LIMIT 50
  `
  return rows
}

export async function getPromotionTargets(promotionId: string) {
  const { rows } = await sql`
    SELECT pt.*, p.programme_name, p.whatsapp_group_id
    FROM promotion_targets pt
    JOIN programmes p ON p.id = pt.programme_id
    WHERE pt.promotion_id = ${promotionId}
  `
  return rows
}

export async function updatePromotionMessage(id: string, generatedMessage: string) {
  await sql`UPDATE promotions SET generated_message = ${generatedMessage} WHERE id = ${id}`
}

export async function markPromotionTargetSent(targetId: string) {
  await sql`
    UPDATE promotion_targets
    SET send_status = 'sent', sent_at = NOW()
    WHERE id = ${targetId}
  `
}

export async function markPromotionTargetFailed(targetId: string, error: string) {
  await sql`
    UPDATE promotion_targets
    SET send_status = 'failed', error = ${error}
    WHERE id = ${targetId}
  `
}

export async function finalisePromotion(id: string, status: 'sent' | 'partial_failure') {
  await sql`
    UPDATE promotions SET status = ${status}, sent_at = NOW() WHERE id = ${id}
  `
}

// ─── Polls ───

export interface PollCreateInput {
  createdBy: string
  question: string
  options: string[]
  responseType: 'single' | 'multiple'
  closesAt?: string | null
  anonymous: boolean
  programmeIds: string[]
  // Flow 1 additions
  capacity?: number | null
  sessionAt?: string | null
  yesOptionIndex?: number | null
  paymentLink?: string | null
  promotionId?: string | null
}

export async function createPoll(input: PollCreateInput) {
  const { rows } = await sql`
    INSERT INTO polls (
      created_by, question, options, response_type, closes_at, anonymous,
      capacity, session_at, yes_option_index, payment_link, promotion_id
    )
    VALUES (
      ${input.createdBy}, ${input.question}, ${JSON.stringify(input.options)}::jsonb,
      ${input.responseType}, ${input.closesAt ?? null}, ${input.anonymous},
      ${input.capacity ?? null}, ${input.sessionAt ?? null},
      ${input.yesOptionIndex ?? 0}, ${input.paymentLink ?? null}, ${input.promotionId ?? null}
    )
    RETURNING *
  `
  const poll = rows[0]
  for (const programmeId of input.programmeIds) {
    await sql`
      INSERT INTO poll_targets (poll_id, programme_id)
      VALUES (${poll.id}, ${programmeId})
      ON CONFLICT DO NOTHING
    `
  }
  return poll
}

export async function getPoll(id: string) {
  const { rows } = await sql`SELECT * FROM polls WHERE id = ${id} LIMIT 1`
  return rows[0] || null
}

export async function listPollsForCoach(coachId: string) {
  const { rows } = await sql`
    SELECT * FROM polls WHERE created_by = ${coachId} ORDER BY created_at DESC LIMIT 50
  `
  return rows
}

export async function getPollTargets(pollId: string) {
  const { rows } = await sql`
    SELECT pt.*, p.programme_name, p.whatsapp_group_id
    FROM poll_targets pt
    JOIN programmes p ON p.id = pt.programme_id
    WHERE pt.poll_id = ${pollId}
  `
  return rows
}

export async function closePoll(id: string) {
  await sql`UPDATE polls SET status = 'closed', closed_at = NOW() WHERE id = ${id}`
}

export async function extendPoll(id: string, newCloseAt: string) {
  await sql`UPDATE polls SET closes_at = ${newCloseAt} WHERE id = ${id}`
}

export interface PollResponseResult {
  status: 'confirmed' | 'waitlisted' | 'noted' | 'closed'
  was_yes: boolean
  capacity: number | null
  confirmed_count: number
  remaining: number | null
  payment_link: string | null
  poll_question: string
  yes_option: string | null
}

// Records a poll vote and applies Flow 1 capacity logic:
//   - If the vote matches the configured yes_option and capacity is hit,
//     status='waitlisted' and a waitlist row is created (poll-scoped).
//   - If the vote is yes and we still have room, status='confirmed' and the
//     poll's payment_link (if any) goes in the result so the caller can DM it.
//   - Other votes (no/maybe) return status='noted' for logging only.
//   - Re-votes by the same sender replace their prior response.
export async function recordPollResponse(
  pollId: string,
  programmeId: string,
  senderJid: string,
  senderName: string,
  chosenOption: string
): Promise<PollResponseResult> {
  // Load the poll's capacity config
  const { rows: pollRows } = await sql`
    SELECT id, question, options, capacity, yes_option_index, payment_link, status,
           (SELECT coach_id FROM programmes WHERE id = ${programmeId}) as coach_id
    FROM polls WHERE id = ${pollId} LIMIT 1
  `
  const poll = pollRows[0] as
    | {
        id: string
        question: string
        options: unknown
        capacity: number | null
        yes_option_index: number | null
        payment_link: string | null
        status: string
        coach_id: string | null
      }
    | undefined

  if (!poll) {
    return {
      status: 'noted',
      was_yes: false,
      capacity: null,
      confirmed_count: 0,
      remaining: null,
      payment_link: null,
      poll_question: '',
      yes_option: null,
    }
  }

  const optionsArr: string[] = Array.isArray(poll.options)
    ? (poll.options as string[])
    : JSON.parse((poll.options as string) || '[]')
  const yesIdx = poll.yes_option_index ?? 0
  const yesOption = optionsArr[yesIdx] ?? null
  const was_yes = !!yesOption && chosenOption.toLowerCase() === yesOption.toLowerCase()

  if (poll.status !== 'active') {
    return {
      status: 'closed',
      was_yes,
      capacity: poll.capacity,
      confirmed_count: 0,
      remaining: null,
      payment_link: poll.payment_link,
      poll_question: poll.question,
      yes_option: yesOption,
    }
  }

  // Replace any prior response from this sender
  await sql`DELETE FROM poll_responses WHERE poll_id = ${pollId} AND sender_jid = ${senderJid}`

  // Capacity check happens BEFORE the insert so the new vote competes
  // fairly with existing yes-voters. We count current confirmed yes
  // responses (excluding the now-deleted prior vote from this sender).
  let confirmedCount = 0
  if (was_yes && poll.capacity != null) {
    const { rows: countRows } = await sql`
      SELECT COUNT(*)::int as n FROM poll_responses
      WHERE poll_id = ${pollId} AND chosen_option = ${yesOption}
    `
    confirmedCount = Number(countRows[0]?.n ?? 0)
  }

  // At-capacity yes votes get routed to waitlist instead of poll_responses
  if (was_yes && poll.capacity != null && confirmedCount >= poll.capacity) {
    if (poll.coach_id) {
      // Look up the member id from the sender_jid so the waitlist row is
      // proper. Falls through to a jid-only entry if no member match.
      const digits = senderJid.replace(/@.*$/, '').replace(/\D/g, '')
      const { rows: memberRows } = await sql`
        SELECT id FROM members
        WHERE parent_whatsapp_id = ${senderJid}
           OR parent_whatsapp_id = ${digits}
           OR regexp_replace(COALESCE(parent_phone, ''), '\\D', '', 'g') = ${digits}
        LIMIT 1
      `
      const memberId = (memberRows[0]?.id as string | undefined) || null
      if (memberId) {
        await sql`
          INSERT INTO waitlist (coach_id, member_id, member_jid, target_type, target_label, poll_id)
          VALUES (
            ${poll.coach_id}, ${memberId}, ${senderJid},
            'class_session', ${poll.question}, ${pollId}
          )
          ON CONFLICT DO NOTHING
        `
      }
    }
    return {
      status: 'waitlisted',
      was_yes: true,
      capacity: poll.capacity,
      confirmed_count: confirmedCount,
      remaining: 0,
      payment_link: poll.payment_link,
      poll_question: poll.question,
      yes_option: yesOption,
    }
  }

  // Normal insert
  await sql`
    INSERT INTO poll_responses (poll_id, programme_id, sender_jid, sender_name, chosen_option)
    VALUES (${pollId}, ${programmeId}, ${senderJid}, ${senderName}, ${chosenOption})
  `

  // If this YES filled the last seat, auto-close the poll (so the bot
  // doesn't keep accepting votes that'd land in waitlist immediately).
  const newConfirmedCount = was_yes ? confirmedCount + 1 : confirmedCount
  if (poll.capacity != null && newConfirmedCount >= poll.capacity) {
    await sql`UPDATE polls SET status = 'closed', closed_at = NOW() WHERE id = ${pollId} AND status = 'active'`
  }

  return {
    status: was_yes ? 'confirmed' : 'noted',
    was_yes,
    capacity: poll.capacity,
    confirmed_count: newConfirmedCount,
    remaining: poll.capacity != null ? Math.max(0, poll.capacity - newConfirmedCount) : null,
    payment_link: poll.payment_link,
    poll_question: poll.question,
    yes_option: yesOption,
  }
}

export async function getPollTally(pollId: string) {
  const { rows } = await sql`
    SELECT chosen_option, COUNT(*) as count
    FROM poll_responses
    WHERE poll_id = ${pollId}
    GROUP BY chosen_option
    ORDER BY count DESC
  `
  return rows
}

export async function getActivePollForGroup(groupJid: string) {
  const { rows } = await sql`
    SELECT p.*, pt.programme_id
    FROM polls p
    JOIN poll_targets pt ON pt.poll_id = p.id
    JOIN programmes pr ON pr.id = pt.programme_id
    WHERE pr.whatsapp_group_id = ${groupJid}
      AND p.status = 'active'
      AND (p.closes_at IS NULL OR p.closes_at > NOW())
    ORDER BY p.created_at DESC
    LIMIT 1
  `
  return rows[0] || null
}

export async function setPollTargetMessageId(
  pollId: string,
  programmeId: string,
  waMessageId: string
) {
  await sql`
    UPDATE poll_targets
    SET wa_message_id = ${waMessageId}
    WHERE poll_id = ${pollId} AND programme_id = ${programmeId}
  `
}

/**
 * Find the poll + programme for a given WhatsApp poll message id.
 * Used by the webhook when a pollUpdateMessage event arrives.
 */
export async function getPollByWaMessageId(waMessageId: string) {
  const { rows } = await sql`
    SELECT p.id as poll_id, p.options, p.response_type, p.status, p.promotion_id, pt.programme_id
    FROM poll_targets pt
    JOIN polls p ON p.id = pt.poll_id
    WHERE pt.wa_message_id = ${waMessageId}
    LIMIT 1
  `
  return rows[0] || null
}

// ─── Fixtures ───

export interface FixtureCreateInput {
  programmeId: string
  createdBy: string
  fixtureType: 'league' | 'friendly' | 'cup' | 'tournament' | 'other'
  opposition?: string | null
  homeAway?: 'home' | 'away' | null
  kickoffAt: string
  meetAt?: string | null
  venue?: string | null
  kitNotes?: string | null
  availabilityPollId?: string | null
}

export async function createFixture(input: FixtureCreateInput) {
  const { rows } = await sql`
    INSERT INTO fixtures (
      programme_id, created_by, fixture_type, opposition, home_away,
      kickoff_at, meet_at, venue, kit_notes, availability_poll_id
    )
    VALUES (
      ${input.programmeId}, ${input.createdBy}, ${input.fixtureType},
      ${input.opposition ?? null}, ${input.homeAway ?? null},
      ${input.kickoffAt}, ${input.meetAt ?? null}, ${input.venue ?? null},
      ${input.kitNotes ?? null}, ${input.availabilityPollId ?? null}
    )
    RETURNING *
  `
  return rows[0]
}

export async function getFixture(id: string) {
  const { rows } = await sql`SELECT * FROM fixtures WHERE id = ${id} LIMIT 1`
  return rows[0] || null
}

export async function listFixturesForCoach(coachId: string) {
  const { rows } = await sql`
    SELECT f.*, p.programme_name
    FROM fixtures f
    JOIN programmes p ON p.id = f.programme_id
    WHERE f.created_by = ${coachId}
    ORDER BY f.kickoff_at DESC
    LIMIT 50
  `
  return rows
}

export async function cancelFixture(id: string) {
  await sql`UPDATE fixtures SET status = 'cancelled' WHERE id = ${id}`
}

// ─── Schedule (series + exceptions) ───

export interface SeriesCreateInput {
  programmeId: string
  seriesType: 'training' | 'fixture_recurring'
  title?: string | null
  recurrenceRule: string
  seriesStart: string
  seriesEnd?: string | null
  defaultTime: string
  defaultDurationMins?: number
  defaultVenue?: string | null
}

export async function createSeries(input: SeriesCreateInput) {
  const { rows } = await sql`
    INSERT INTO schedule_series (
      programme_id, series_type, title, recurrence_rule,
      series_start, series_end, default_time, default_duration_mins, default_venue
    )
    VALUES (
      ${input.programmeId}, ${input.seriesType}, ${input.title ?? null},
      ${input.recurrenceRule}, ${input.seriesStart}, ${input.seriesEnd ?? null},
      ${input.defaultTime}, ${input.defaultDurationMins ?? 60}, ${input.defaultVenue ?? null}
    )
    RETURNING *
  `
  return rows[0]
}

export async function listSeriesForProgramme(programmeId: string) {
  const { rows } = await sql`
    SELECT * FROM schedule_series WHERE programme_id = ${programmeId} ORDER BY series_start ASC
  `
  return rows
}

export async function getSeries(id: string) {
  const { rows } = await sql`SELECT * FROM schedule_series WHERE id = ${id} LIMIT 1`
  return rows[0] || null
}

export async function createException(input: {
  seriesId: string
  originalDate: string
  status: 'cancelled' | 'rescheduled'
  rescheduledTo?: string | null
  reason?: string | null
  cancelledBy: string
}) {
  const { rows } = await sql`
    INSERT INTO schedule_exceptions (
      series_id, original_date, status, rescheduled_to, reason, cancelled_by
    )
    VALUES (
      ${input.seriesId}, ${input.originalDate}, ${input.status},
      ${input.rescheduledTo ?? null}, ${input.reason ?? null}, ${input.cancelledBy}
    )
    ON CONFLICT (series_id, original_date) DO UPDATE SET
      status = EXCLUDED.status,
      rescheduled_to = EXCLUDED.rescheduled_to,
      reason = EXCLUDED.reason,
      cancelled_by = EXCLUDED.cancelled_by,
      cancelled_at = NOW()
    RETURNING *
  `
  return rows[0]
}

export async function getExceptionsForSeries(seriesId: string, fromDate?: string) {
  if (fromDate) {
    const { rows } = await sql`
      SELECT * FROM schedule_exceptions
      WHERE series_id = ${seriesId} AND original_date >= ${fromDate}
    `
    return rows
  }
  const { rows } = await sql`
    SELECT * FROM schedule_exceptions WHERE series_id = ${seriesId}
  `
  return rows
}

// ─── Notifications log ───

export async function logNotification(input: {
  eventType: string
  triggerUser?: string | null
  programmeId?: string | null
  recipientType: 'coach' | 'gm' | 'admin' | 'group' | 'parent' | 'member'
  recipientJid?: string | null
  channel?: string
  status: 'sent' | 'failed'
  error?: string | null
}) {
  await sql`
    INSERT INTO notifications_log (
      event_type, trigger_user, programme_id, recipient_type, recipient_jid,
      channel, status, error
    )
    VALUES (
      ${input.eventType}, ${input.triggerUser ?? null}, ${input.programmeId ?? null},
      ${input.recipientType}, ${input.recipientJid ?? null},
      ${input.channel ?? 'whatsapp'}, ${input.status}, ${input.error ?? null}
    )
  `
}

// ─── Referrals ───

export interface ReferralCreateInput {
  promotionId: string
  programmeId: string
  friendFirstName: string
  childName?: string | null
  friendEmail?: string | null
  friendPhone: string
  referredByName?: string | null
  referrerMemberId?: string | null
}

export async function createReferral(input: ReferralCreateInput) {
  const resolved = !!input.referrerMemberId
  const { rows } = await sql`
    INSERT INTO referrals (
      promotion_id, programme_id, friend_first_name, child_name,
      friend_email, friend_phone, referred_by_name,
      referrer_member_id, referrer_resolved
    )
    VALUES (
      ${input.promotionId}, ${input.programmeId}, ${input.friendFirstName},
      ${input.childName ?? null}, ${input.friendEmail ?? null},
      ${input.friendPhone}, ${input.referredByName ?? null},
      ${input.referrerMemberId ?? null}, ${resolved}
    )
    RETURNING *
  `
  return rows[0]
}

// Safe public listing for the /refer/[slug] dropdown. Returns only what the
// landing page needs to disambiguate referrers — first name + last initial,
// keyed by member_id. No phone, no email, no child names exposed.
export interface ReferrerCandidate {
  id: string
  display_name: string  // "Sarah B."
}
export async function listReferrerCandidatesForProgramme(programmeId: string): Promise<ReferrerCandidate[]> {
  const { rows } = await sql`
    SELECT id, parent_name
    FROM members
    WHERE programme_id = ${programmeId}
      AND status = 'active'
      AND parent_name IS NOT NULL
      AND parent_name <> ''
    ORDER BY parent_name ASC
  `
  return rows
    .map((r) => {
      const parts = String(r.parent_name).trim().split(/\s+/)
      const first = parts[0]
      const lastInitial = parts.length > 1 ? `${parts[parts.length - 1][0]}.` : ''
      return { id: r.id as string, display_name: lastInitial ? `${first} ${lastInitial}` : first }
    })
    .filter((c) => c.display_name.length > 0)
}

// Verify a member_id genuinely belongs to a programme — defence against a
// malicious POST passing an arbitrary UUID. Returns the resolved row or null.
export async function getMemberForProgramme(memberId: string, programmeId: string) {
  const { rows } = await sql`
    SELECT id, parent_name, parent_phone, parent_whatsapp_id
    FROM members
    WHERE id = ${memberId} AND programme_id = ${programmeId}
    LIMIT 1
  `
  return rows[0] || null
}

// ─── Individual referral DMs (send a referral link to specific members) ───

// Resolve a phone-based WhatsApp JID we can actually DM, or null. A member
// known only by a LID (`…@lid`) is NOT directly messageable, so we fall back
// to the stored phone number; if there's no usable number either, return null
// and the caller skips them.
export function resolveMemberJid(
  parentWhatsappId: string | null | undefined,
  parentPhone: string | null | undefined
): string | null {
  const waid = (parentWhatsappId || '').trim()
  if (waid.endsWith('@s.whatsapp.net')) return waid
  const phone = (parentPhone || '').trim()
  if (phone) return normalizeUkPhoneToJid(phone)
  return null
}

export interface MessageableMember {
  id: string
  display_name: string  // "Sarah B." — same privacy shape as the referrer dropdown
  jid: string           // phone-based JID we can DM
  opted_out: boolean
}

// Active members of a programme we can DM a 1:1 promo to. LID-only members
// (no resolvable phone) are excluded — you can't start a DM to a @lid.
// Opted-out members ARE returned (with opted_out=true) so the UI can show and
// disable them rather than silently dropping people.
export async function listMessageableMembersForProgramme(
  programmeId: string
): Promise<MessageableMember[]> {
  const { rows } = await sql`
    SELECT id, parent_name, parent_whatsapp_id, parent_phone, marketing_opt_out
    FROM members
    WHERE programme_id = ${programmeId}
      AND status = 'active'
    ORDER BY parent_name ASC NULLS LAST
  `
  const out: MessageableMember[] = []
  for (const r of rows) {
    const jid = resolveMemberJid(r.parent_whatsapp_id, r.parent_phone)
    if (!jid) continue
    const parts = String(r.parent_name || '').trim().split(/\s+/).filter(Boolean)
    const first = parts[0] || 'Member'
    const lastInitial = parts.length > 1 ? ` ${parts[parts.length - 1][0]}.` : ''
    out.push({
      id: r.id as string,
      display_name: `${first}${lastInitial}`,
      jid,
      opted_out: !!r.marketing_opt_out,
    })
  }
  return out
}

// Mark every member matching an inbound 1:1 JID as opted out of marketing.
// The inbound remoteJid is phone-based, so we narrow on the last 9 digits
// (robust across 07.../447... storage) then confirm an exact JID match in JS
// before flipping the flag. Returns how many rows were updated.
export async function optOutMemberByJid(jid: string): Promise<number> {
  const target = jid.endsWith('@s.whatsapp.net') ? jid : normalizeUkPhoneToJid(jid)
  const digits = target.replace(/@.*$/, '').replace(/\D/g, '')
  if (digits.length < 6) return 0
  const last9 = digits.slice(-9)
  const { rows } = await sql`
    SELECT id, parent_whatsapp_id, parent_phone
    FROM members
    WHERE marketing_opt_out = FALSE
      AND (
        regexp_replace(COALESCE(parent_whatsapp_id, ''), '\D', '', 'g') LIKE ${'%' + last9}
        OR regexp_replace(COALESCE(parent_phone, ''), '\D', '', 'g') LIKE ${'%' + last9}
      )
  `
  const ids = rows
    .filter((r) => resolveMemberJid(r.parent_whatsapp_id, r.parent_phone) === target)
    .map((r) => r.id as string)
  if (ids.length === 0) return 0
  await sql`
    UPDATE members
    SET marketing_opt_out = TRUE, marketing_opt_out_at = NOW()
    WHERE id = ANY(${ids}::uuid[])
  `
  return ids.length
}

export async function listReferralsForCoach(coachId: string) {
  // Includes the new attribution + reward fields so the dashboard can
  // render the one-tap actions without a second round-trip.
  const { rows } = await sql`
    SELECT r.id, r.status, r.friend_first_name, r.child_name,
           r.friend_phone, r.friend_email,
           r.referred_by_name, r.referrer_member_id, r.referrer_resolved,
           r.referrer_reward_status, r.referee_reward_status,
           r.first_session_at, r.attended_at, r.converted_at, r.created_at,
           r.promotion_id, r.programme_id,
           pr.title as promotion_title,
           pm.programme_name,
           rm.parent_name as referrer_parent_name,
           rm.referral_credits_balance as referrer_credits_balance
    FROM referrals r
    JOIN promotions pr ON pr.id = r.promotion_id
    JOIN programmes pm ON pm.id = r.programme_id
    LEFT JOIN members rm ON rm.id = r.referrer_member_id
    WHERE pr.created_by = ${coachId}
    ORDER BY r.created_at DESC
    LIMIT 100
  `
  return rows
}

export async function updateReferralStatus(
  id: string,
  status: 'confirmed' | 'attended' | 'converted' | 'lapsed'
) {
  const now = new Date().toISOString()
  if (status === 'attended') {
    // Side-effect per spec §4.2: when the referee attends, the referrer
    // reward enters the 'notified' state (coach gets the dashboard prompt
    // to issue the credit). We don't auto-issue the credit — issuance is
    // an explicit coach tap so they can verify attendance against memory.
    await sql`
      UPDATE referrals
      SET status = ${status},
          attended_at = ${now},
          referrer_reward_status = CASE
            WHEN referrer_reward_status = 'pending' THEN 'notified'
            ELSE referrer_reward_status
          END
      WHERE id = ${id}
    `
  } else if (status === 'converted') {
    await sql`UPDATE referrals SET status = ${status}, converted_at = ${now} WHERE id = ${id}`
  } else {
    await sql`UPDATE referrals SET status = ${status} WHERE id = ${id}`
  }
}

// ─── Referral credit issuance ───
// Issues +1 free-class credit to the referrer (a member) and records an
// audit entry. Idempotent: re-issuing on a row already 'honoured' is a no-op
// and returns the current balance. Returns the reason code so the caller
// can show the right toast.
export async function issueReferralCreditByCoach(
  referralId: string,
  coachId: string
): Promise<{
  issued: boolean
  balance: number
  reason: string
  memberId: string | null
  refereeChildName: string | null
  refereeFriendFirstName: string | null
}> {
  // Load the referral + verify ownership through the promotion.
  const { rows: refRows } = await sql`
    SELECT r.id, r.referrer_member_id, r.referrer_reward_status, r.status,
           r.friend_first_name, r.child_name, pr.created_by
    FROM referrals r
    JOIN promotions pr ON pr.id = r.promotion_id
    WHERE r.id = ${referralId}
    LIMIT 1
  `
  const ref = refRows[0]
  const baseFail = {
    refereeChildName: null as string | null,
    refereeFriendFirstName: null as string | null,
  }
  if (!ref) return { issued: false, balance: 0, reason: 'referral_not_found', memberId: null, ...baseFail }
  if (ref.created_by !== coachId) return { issued: false, balance: 0, reason: 'forbidden', memberId: null, ...baseFail }
  if (!ref.referrer_member_id) {
    return {
      issued: false, balance: 0, reason: 'referrer_unresolved', memberId: null,
      refereeChildName: ref.child_name || null,
      refereeFriendFirstName: ref.friend_first_name || null,
    }
  }
  if (ref.referrer_reward_status === 'honoured') {
    const { rows: m } = await sql`SELECT referral_credits_balance FROM members WHERE id = ${ref.referrer_member_id}`
    return {
      issued: false,
      balance: m[0]?.referral_credits_balance || 0,
      reason: 'already_honoured',
      memberId: ref.referrer_member_id,
      refereeChildName: ref.child_name || null,
      refereeFriendFirstName: ref.friend_first_name || null,
    }
  }
  if (ref.status !== 'attended' && ref.status !== 'converted') {
    return {
      issued: false, balance: 0, reason: 'referee_not_attended', memberId: null,
      refereeChildName: ref.child_name || null,
      refereeFriendFirstName: ref.friend_first_name || null,
    }
  }

  // Idempotency claim: flip the referral row's status atomically with a
  // WHERE that only matches if no one has issued yet. rowCount tells us
  // whether we won the race. If we didn't, return as already_honoured —
  // no balance bump, no ledger row, no double-credit.
  const claim = await sql`
    UPDATE referrals
    SET referrer_reward_status = 'honoured'
    WHERE id = ${referralId} AND referrer_reward_status <> 'honoured'
  `
  if ((claim.rowCount ?? 0) === 0) {
    const { rows: m } = await sql`SELECT referral_credits_balance FROM members WHERE id = ${ref.referrer_member_id}`
    return {
      issued: false,
      balance: m[0]?.referral_credits_balance || 0,
      reason: 'already_honoured',
      memberId: ref.referrer_member_id,
      refereeChildName: ref.child_name || null,
      refereeFriendFirstName: ref.friend_first_name || null,
    }
  }

  // We won the claim — safe to bump balance + log.
  await sql`
    UPDATE members
    SET referral_credits_balance = referral_credits_balance + 1
    WHERE id = ${ref.referrer_member_id}
  `
  await sql`
    INSERT INTO referral_credit_ledger (member_id, referral_id, delta, reason, issued_by, notes)
    VALUES (
      ${ref.referrer_member_id}, ${referralId}, 1, 'referral_attended',
      ${coachId},
      ${`Credit for referring ${ref.friend_first_name}${ref.child_name ? ' (' + ref.child_name + ')' : ''}`}
    )
  `

  const { rows: m } = await sql`SELECT referral_credits_balance FROM members WHERE id = ${ref.referrer_member_id}`
  return {
    issued: true,
    balance: m[0]?.referral_credits_balance || 0,
    reason: 'ok',
    memberId: ref.referrer_member_id,
    refereeChildName: ref.child_name || null,
    refereeFriendFirstName: ref.friend_first_name || null,
  }
}

// Campaign-level rollups for the Referrals tab "Active Campaigns" panel
// (spec §6.1 / §6.2). One row per refer-a-friend promotion the coach owns,
// with submitted / attended / converted / credit counts in a single query
// so the dashboard avoids N+1.
export interface ReferralCampaignSummary {
  promotion_id: string
  title: string | null
  status: string
  created_at: string
  programme_name: string | null
  leads_total: number
  attended: number
  converted: number
  credits_issued: number
}
export async function listReferralCampaignsForCoach(coachId: string): Promise<ReferralCampaignSummary[]> {
  const { rows } = await sql`
    SELECT
      pr.id          as promotion_id,
      pr.title       as title,
      pr.status      as status,
      pr.created_at  as created_at,
      pm.programme_name as programme_name,
      COUNT(r.id)::int                                                       as leads_total,
      COUNT(r.id) FILTER (WHERE r.status IN ('attended','converted'))::int   as attended,
      COUNT(r.id) FILTER (WHERE r.status = 'converted')::int                 as converted,
      COUNT(r.id) FILTER (WHERE r.referrer_reward_status = 'honoured')::int  as credits_issued
    FROM promotions pr
    LEFT JOIN promotion_targets pt ON pt.promotion_id = pr.id
    LEFT JOIN programmes pm ON pm.id = pt.programme_id
    LEFT JOIN referrals r ON r.promotion_id = pr.id
    WHERE pr.created_by = ${coachId}
      AND pr.promotion_type = 'refer_a_friend'
    GROUP BY pr.id, pr.title, pr.status, pr.created_at, pm.programme_name
    ORDER BY pr.created_at DESC
    LIMIT 50
  `
  return rows as ReferralCampaignSummary[]
}

// Look up a member's credit balance + contact info for the credit-issued
// WhatsApp notification.
export async function getMemberCreditContext(memberId: string) {
  const { rows } = await sql`
    SELECT id, parent_name, parent_phone, parent_whatsapp_id,
           referral_credits_balance, programme_id
    FROM members
    WHERE id = ${memberId}
    LIMIT 1
  `
  return rows[0] || null
}

export async function getPromotionBySlug(slug: string) {
  const { rows } = await sql`SELECT * FROM promotions WHERE slug = ${slug} LIMIT 1`
  return rows[0] || null
}

// ─── Referral context + nudge queue ───

/**
 * Returns the referral plus the context needed to compose a message:
 * programme name, coach name, venue, first session time.
 */
export async function getReferralContext(referralId: string) {
  const { rows } = await sql`
    SELECT r.*,
           p.programme_name, p.venue_name, p.session_days, p.session_start_time,
           c.id as coach_id,
           c.first_name as coach_first_name, c.last_name as coach_last_name,
           c.mobile as coach_mobile
    FROM referrals r
    JOIN programmes p ON p.id = r.programme_id
    JOIN coaches_v2 c ON c.id = p.coach_id
    WHERE r.id = ${referralId}
    LIMIT 1
  `
  return rows[0] || null
}

/**
 * Referrals that may be due for a nudge based on time elapsed.
 * Only returns active referrals (not lapsed / converted).
 * The cron handler decides which specific step to send.
 */
export async function listReferralsDueForNudge() {
  const { rows } = await sql`
    SELECT r.*,
           p.programme_name, p.venue_name, p.session_days, p.session_start_time,
           c.first_name as coach_first_name, c.last_name as coach_last_name
    FROM referrals r
    JOIN programmes p ON p.id = r.programme_id
    JOIN coaches_v2 c ON c.id = p.coach_id
    WHERE r.status IN ('referral_pending', 'confirmed', 'attended')
      AND r.created_at > NOW() - INTERVAL '30 days'
  `
  return rows
}

export async function markReferralNudged(id: string, step: string) {
  await sql`
    UPDATE referrals
    SET last_nudged_at = NOW(), last_nudge_step = ${step}
    WHERE id = ${id}
  `
}

export async function setReferralFirstSession(id: string, firstSessionAt: string) {
  await sql`UPDATE referrals SET first_session_at = ${firstSessionAt} WHERE id = ${id}`
}
