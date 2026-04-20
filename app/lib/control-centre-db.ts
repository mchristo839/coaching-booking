// app/lib/control-centre-db.ts
// DB helpers for the Coach Control Centre features.
// Kept in a separate file so it's easy to see what's new vs legacy db.ts.
// SERVER-SIDE ONLY.

import { sql } from '@vercel/postgres'

// ─── Promotions ───

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
}

export async function createPromotion(input: PromotionCreateInput) {
  const { rows } = await sql`
    INSERT INTO promotions (
      created_by, promotion_type, title, detail, start_at, end_at,
      venue, cost_gbp, is_free, payment_link, send_mode, generated_message, slug
    )
    VALUES (
      ${input.createdBy}, ${input.promotionType}, ${input.title ?? null}, ${input.detail},
      ${input.startAt ?? null}, ${input.endAt ?? null},
      ${input.venue ?? null}, ${input.costGbp ?? null}, ${input.isFree ?? false},
      ${input.paymentLink ?? null}, ${input.sendMode}, ${input.generatedMessage ?? null},
      ${input.slug ?? null}
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
}

export async function createPoll(input: PollCreateInput) {
  const { rows } = await sql`
    INSERT INTO polls (created_by, question, options, response_type, closes_at, anonymous)
    VALUES (
      ${input.createdBy}, ${input.question}, ${JSON.stringify(input.options)}::jsonb,
      ${input.responseType}, ${input.closesAt ?? null}, ${input.anonymous}
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

export async function recordPollResponse(
  pollId: string,
  programmeId: string,
  senderJid: string,
  senderName: string,
  chosenOption: string
) {
  // Remove any previous response from this sender to this poll first (single-choice replacement)
  await sql`
    DELETE FROM poll_responses WHERE poll_id = ${pollId} AND sender_jid = ${senderJid}
  `
  await sql`
    INSERT INTO poll_responses (poll_id, programme_id, sender_jid, sender_name, chosen_option)
    VALUES (${pollId}, ${programmeId}, ${senderJid}, ${senderName}, ${chosenOption})
  `
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
  recipientType: 'coach' | 'gm' | 'admin' | 'group' | 'parent'
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
}

export async function createReferral(input: ReferralCreateInput) {
  const { rows } = await sql`
    INSERT INTO referrals (
      promotion_id, programme_id, friend_first_name, child_name,
      friend_email, friend_phone, referred_by_name
    )
    VALUES (
      ${input.promotionId}, ${input.programmeId}, ${input.friendFirstName},
      ${input.childName ?? null}, ${input.friendEmail ?? null},
      ${input.friendPhone}, ${input.referredByName ?? null}
    )
    RETURNING *
  `
  return rows[0]
}

export async function listReferralsForCoach(coachId: string) {
  const { rows } = await sql`
    SELECT r.*, pr.title as promotion_title, pm.programme_name
    FROM referrals r
    JOIN promotions pr ON pr.id = r.promotion_id
    JOIN programmes pm ON pm.id = r.programme_id
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
    await sql`UPDATE referrals SET status = ${status}, attended_at = ${now} WHERE id = ${id}`
  } else if (status === 'converted') {
    await sql`UPDATE referrals SET status = ${status}, converted_at = ${now} WHERE id = ${id}`
  } else {
    await sql`UPDATE referrals SET status = ${status} WHERE id = ${id}`
  }
}

export async function getPromotionBySlug(slug: string) {
  const { rows } = await sql`SELECT * FROM promotions WHERE slug = ${slug} LIMIT 1`
  return rows[0] || null
}
