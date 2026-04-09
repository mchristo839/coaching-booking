// app/lib/db.ts
// SERVER-SIDE ONLY: Never import this in client components.
// All client components call fetch('/api/...') instead.

import { sql } from '@vercel/postgres'

// ─── Providers ───

export async function findProviderByEmail(email: string) {
  const { rows } = await sql`SELECT * FROM providers WHERE email = ${email} LIMIT 1`
  return rows[0] || null
}

export async function createProvider(data: {
  firstName: string
  lastName: string
  email: string
  passwordHash: string
  mobileWhatsapp?: string
  tradingName?: string
  townCity?: string
  postcode?: string
  referralSource?: string
}) {
  const { rows } = await sql`
    INSERT INTO providers (first_name, last_name, email, password_hash, mobile_whatsapp, trading_name, town_city, postcode, referral_source)
    VALUES (${data.firstName}, ${data.lastName}, ${data.email}, ${data.passwordHash}, ${data.mobileWhatsapp || ''}, ${data.tradingName || null}, ${data.townCity || null}, ${data.postcode || null}, ${data.referralSource || null})
    RETURNING *
  `
  return rows[0]
}

export async function updateProvider(providerId: string, fields: Record<string, unknown>) {
  // Build dynamic update — only update fields that are provided
  if (fields.emailVerified !== undefined) {
    await sql`UPDATE providers SET email_verified = ${fields.emailVerified as boolean}, registration_status = 'email_verified', updated_at = NOW() WHERE id = ${providerId}`
  }
  if (fields.registrationStatus !== undefined) {
    await sql`UPDATE providers SET registration_status = ${fields.registrationStatus as string}, updated_at = NOW() WHERE id = ${providerId}`
  }
  if (fields.tradingName !== undefined) {
    await sql`UPDATE providers SET trading_name = ${fields.tradingName as string}, updated_at = NOW() WHERE id = ${providerId}`
  }
  const { rows } = await sql`SELECT * FROM providers WHERE id = ${providerId}`
  return rows[0]
}

// ─── Coaches ───

export async function createCoach(data: {
  providerId: string
  firstName: string
  lastName: string
  email: string
  mobile: string
  sport?: string
  coachingLevel?: string
  dbsStatus?: string
  dbsIssueDate?: string
  governingBody?: string[]
  firstAid?: string
  publicLiability?: string
}) {
  const gb = data.governingBody ? `{${data.governingBody.join(',')}}` : null
  const { rows } = await sql`
    INSERT INTO coaches_v2 (provider_id, first_name, last_name, email, mobile, sport, coaching_level, dbs_status, dbs_issue_date, governing_body, first_aid, public_liability)
    VALUES (${data.providerId}, ${data.firstName}, ${data.lastName}, ${data.email}, ${data.mobile}, ${data.sport || null}, ${data.coachingLevel || null}, ${data.dbsStatus || null}, ${data.dbsIssueDate || null}, ${gb}, ${data.firstAid || null}, ${data.publicLiability || null})
    RETURNING *
  `
  return rows[0]
}

export async function findCoachByProviderId(providerId: string) {
  const { rows } = await sql`SELECT * FROM coaches_v2 WHERE provider_id = ${providerId} LIMIT 1`
  return rows[0] || null
}

export async function findCoachById(coachId: string) {
  const { rows } = await sql`SELECT * FROM coaches_v2 WHERE id = ${coachId} LIMIT 1`
  return rows[0] || null
}

export async function updateCoachBotStatus(coachId: string, status: string) {
  await sql`UPDATE coaches_v2 SET whatsapp_bot_status = ${status}, updated_at = NOW() WHERE id = ${coachId}`
}

// ─── Programmes ───

export interface ProgrammeData {
  coachId: string
  programmeName: string
  shortDescription?: string
  targetAudience?: string
  specificAgeGroup?: string
  skillLevel?: string
  programmeType?: string
  sessionDays?: string[]
  sessionStartTime?: string
  sessionDuration?: string
  sessionFrequency?: string
  holidaySchedule?: string
  cancellationNotice?: string
  venueName?: string
  venueAddress?: string
  parking?: string
  nearestTransport?: string
  indoorOutdoor?: string
  badWeatherPolicy?: string
  maxCapacity?: number
  fullThreshold?: string
  waitlistEnabled?: boolean
  referralTrigger?: string
  referralIncentive?: string
  programmeStatus?: string
  trialAvailable?: string
  trialInstructions?: string
  whatToBring?: string
  equipmentProvided?: string
  kitRequired?: string
  kitDetails?: string
  paidOrFree?: string
  paymentModel?: string
  priceGbp?: number
  priceIncludes?: string
  siblingDiscount?: string
  refundPolicy?: string
  refundDetails?: string
  paymentMethods?: string[]
  paymentReminderSchedule?: string
  botNotes?: string
  whatsappGroupId?: string
}

export async function createProgramme(data: ProgrammeData) {
  const days = data.sessionDays ? `{${data.sessionDays.join(',')}}` : null
  const methods = data.paymentMethods ? `{${data.paymentMethods.join(',')}}` : null
  const { rows } = await sql`
    INSERT INTO programmes (
      coach_id, programme_name, short_description, target_audience, specific_age_group,
      skill_level, programme_type, session_days, session_start_time, session_duration,
      session_frequency, holiday_schedule, cancellation_notice, venue_name, venue_address,
      parking, nearest_transport, indoor_outdoor, bad_weather_policy, max_capacity,
      full_threshold, waitlist_enabled, referral_trigger, referral_incentive, programme_status,
      trial_available, trial_instructions, what_to_bring, equipment_provided, kit_required,
      kit_details, paid_or_free, payment_model, price_gbp, price_includes,
      sibling_discount, refund_policy, refund_details, payment_methods, payment_reminder_schedule,
      bot_notes, whatsapp_group_id
    )
    VALUES (
      ${data.coachId}, ${data.programmeName}, ${data.shortDescription || null}, ${data.targetAudience || null}, ${data.specificAgeGroup || null},
      ${data.skillLevel || null}, ${data.programmeType || null}, ${days}, ${data.sessionStartTime || null}, ${data.sessionDuration || null},
      ${data.sessionFrequency || null}, ${data.holidaySchedule || null}, ${data.cancellationNotice || null}, ${data.venueName || null}, ${data.venueAddress || null},
      ${data.parking || null}, ${data.nearestTransport || null}, ${data.indoorOutdoor || null}, ${data.badWeatherPolicy || null}, ${data.maxCapacity || null},
      ${data.fullThreshold || 'at_100'}, ${data.waitlistEnabled ?? true}, ${data.referralTrigger || null}, ${data.referralIncentive || null}, ${data.programmeStatus || 'open'},
      ${data.trialAvailable || null}, ${data.trialInstructions || null}, ${data.whatToBring || null}, ${data.equipmentProvided || null}, ${data.kitRequired || null},
      ${data.kitDetails || null}, ${data.paidOrFree || 'paid'}, ${data.paymentModel || null}, ${data.priceGbp || null}, ${data.priceIncludes || null},
      ${data.siblingDiscount || null}, ${data.refundPolicy || null}, ${data.refundDetails || null}, ${methods}, ${data.paymentReminderSchedule || null},
      ${data.botNotes || null}, ${data.whatsappGroupId || null}
    )
    RETURNING *
  `
  return rows[0]
}

export async function updateProgramme(programmeId: string, fields: Partial<ProgrammeData>) {
  // Update individual fields that are provided
  if (fields.programmeName !== undefined) await sql`UPDATE programmes SET programme_name = ${fields.programmeName}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.shortDescription !== undefined) await sql`UPDATE programmes SET short_description = ${fields.shortDescription || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.targetAudience !== undefined) await sql`UPDATE programmes SET target_audience = ${fields.targetAudience || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.specificAgeGroup !== undefined) await sql`UPDATE programmes SET specific_age_group = ${fields.specificAgeGroup || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.skillLevel !== undefined) await sql`UPDATE programmes SET skill_level = ${fields.skillLevel || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.programmeType !== undefined) await sql`UPDATE programmes SET programme_type = ${fields.programmeType || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.sessionStartTime !== undefined) await sql`UPDATE programmes SET session_start_time = ${fields.sessionStartTime || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.sessionDuration !== undefined) await sql`UPDATE programmes SET session_duration = ${fields.sessionDuration || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.sessionFrequency !== undefined) await sql`UPDATE programmes SET session_frequency = ${fields.sessionFrequency || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.holidaySchedule !== undefined) await sql`UPDATE programmes SET holiday_schedule = ${fields.holidaySchedule || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.cancellationNotice !== undefined) await sql`UPDATE programmes SET cancellation_notice = ${fields.cancellationNotice || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.venueName !== undefined) await sql`UPDATE programmes SET venue_name = ${fields.venueName || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.venueAddress !== undefined) await sql`UPDATE programmes SET venue_address = ${fields.venueAddress || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.parking !== undefined) await sql`UPDATE programmes SET parking = ${fields.parking || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.nearestTransport !== undefined) await sql`UPDATE programmes SET nearest_transport = ${fields.nearestTransport || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.indoorOutdoor !== undefined) await sql`UPDATE programmes SET indoor_outdoor = ${fields.indoorOutdoor || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.badWeatherPolicy !== undefined) await sql`UPDATE programmes SET bad_weather_policy = ${fields.badWeatherPolicy || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.maxCapacity !== undefined) await sql`UPDATE programmes SET max_capacity = ${fields.maxCapacity || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.programmeStatus !== undefined) await sql`UPDATE programmes SET programme_status = ${fields.programmeStatus || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.trialAvailable !== undefined) await sql`UPDATE programmes SET trial_available = ${fields.trialAvailable || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.trialInstructions !== undefined) await sql`UPDATE programmes SET trial_instructions = ${fields.trialInstructions || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.whatToBring !== undefined) await sql`UPDATE programmes SET what_to_bring = ${fields.whatToBring || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.paidOrFree !== undefined) await sql`UPDATE programmes SET paid_or_free = ${fields.paidOrFree || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.paymentModel !== undefined) await sql`UPDATE programmes SET payment_model = ${fields.paymentModel || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.priceGbp !== undefined) await sql`UPDATE programmes SET price_gbp = ${fields.priceGbp || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.priceIncludes !== undefined) await sql`UPDATE programmes SET price_includes = ${fields.priceIncludes || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.siblingDiscount !== undefined) await sql`UPDATE programmes SET sibling_discount = ${fields.siblingDiscount || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.refundPolicy !== undefined) await sql`UPDATE programmes SET refund_policy = ${fields.refundPolicy || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.refundDetails !== undefined) await sql`UPDATE programmes SET refund_details = ${fields.refundDetails || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.botNotes !== undefined) await sql`UPDATE programmes SET bot_notes = ${fields.botNotes || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.whatsappGroupId !== undefined) await sql`UPDATE programmes SET whatsapp_group_id = ${fields.whatsappGroupId || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.fullThreshold !== undefined) await sql`UPDATE programmes SET full_threshold = ${fields.fullThreshold || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.waitlistEnabled !== undefined) await sql`UPDATE programmes SET waitlist_enabled = ${fields.waitlistEnabled}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.referralTrigger !== undefined) await sql`UPDATE programmes SET referral_trigger = ${fields.referralTrigger || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.referralIncentive !== undefined) await sql`UPDATE programmes SET referral_incentive = ${fields.referralIncentive || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.equipmentProvided !== undefined) await sql`UPDATE programmes SET equipment_provided = ${fields.equipmentProvided || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.kitRequired !== undefined) await sql`UPDATE programmes SET kit_required = ${fields.kitRequired || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.kitDetails !== undefined) await sql`UPDATE programmes SET kit_details = ${fields.kitDetails || null}, updated_at = NOW() WHERE id = ${programmeId}`
  if (fields.paymentReminderSchedule !== undefined) await sql`UPDATE programmes SET payment_reminder_schedule = ${fields.paymentReminderSchedule || null}, updated_at = NOW() WHERE id = ${programmeId}`

  const { rows } = await sql`SELECT * FROM programmes WHERE id = ${programmeId}`
  return rows[0]
}

export async function listProgrammesByCoach(coachId: string) {
  const { rows } = await sql`
    SELECT p.*,
      (SELECT COUNT(*) FROM members m WHERE m.programme_id = p.id AND m.status = 'active') as member_count,
      (SELECT COUNT(*) FROM members m WHERE m.programme_id = p.id AND m.status = 'waitlisted') as waitlist_count
    FROM programmes p
    WHERE p.coach_id = ${coachId} AND p.is_active = true
    ORDER BY p.created_at DESC
  `
  return rows
}

export async function findProgramme(programmeId: string) {
  const { rows } = await sql`SELECT * FROM programmes WHERE id = ${programmeId} LIMIT 1`
  return rows[0] || null
}

export async function findProgrammeByWhatsAppGroup(whatsappGroupId: string) {
  const { rows } = await sql`
    SELECT p.*, c.first_name as coach_first_name, c.last_name as coach_last_name, c.email as coach_email,
      c.whatsapp_bot_status, c.id as coach_id,
      pr.trading_name
    FROM programmes p
    JOIN coaches_v2 c ON c.id = p.coach_id
    JOIN providers pr ON pr.id = c.provider_id
    WHERE p.whatsapp_group_id = ${whatsappGroupId} AND p.is_active = true
    LIMIT 1
  `
  return rows[0] || null
}

// ─── FAQs ───

export async function createFaq(data: {
  programmeId: string
  question: string
  answer: string
  category?: string
  source?: string
  status?: string
}) {
  const { rows } = await sql`
    INSERT INTO faqs (programme_id, question, answer, category, source, status)
    VALUES (${data.programmeId}, ${data.question}, ${data.answer}, ${data.category || 'custom'}, ${data.source || 'coach'}, ${data.status || 'active'})
    RETURNING *
  `
  return rows[0]
}

export async function createFaqsBulk(programmeId: string, faqs: { question: string; answer: string; category?: string; source?: string }[]) {
  const results = []
  for (const faq of faqs) {
    const row = await createFaq({ programmeId, ...faq })
    results.push(row)
  }
  return results
}

export async function listFaqsByProgramme(programmeId: string, status?: string) {
  if (status) {
    const { rows } = await sql`SELECT * FROM faqs WHERE programme_id = ${programmeId} AND status = ${status} ORDER BY created_at`
    return rows
  }
  const { rows } = await sql`SELECT * FROM faqs WHERE programme_id = ${programmeId} ORDER BY created_at`
  return rows
}

export async function listPendingFaqsByCoach(coachId: string) {
  const { rows } = await sql`
    SELECT f.*, p.programme_name
    FROM faqs f
    JOIN programmes p ON p.id = f.programme_id
    WHERE p.coach_id = ${coachId} AND f.status = 'pending_coach_approval'
    ORDER BY f.created_at DESC
  `
  return rows
}

export async function updateFaq(faqId: string, fields: { question?: string; answer?: string; status?: string }) {
  if (fields.question !== undefined) await sql`UPDATE faqs SET question = ${fields.question}, updated_at = NOW() WHERE id = ${faqId}`
  if (fields.answer !== undefined) await sql`UPDATE faqs SET answer = ${fields.answer}, updated_at = NOW() WHERE id = ${faqId}`
  if (fields.status !== undefined) await sql`UPDATE faqs SET status = ${fields.status}, updated_at = NOW() WHERE id = ${faqId}`
  const { rows } = await sql`SELECT * FROM faqs WHERE id = ${faqId}`
  return rows[0]
}

export async function incrementFaqAsked(faqId: string) {
  await sql`UPDATE faqs SET times_asked = times_asked + 1 WHERE id = ${faqId}`
}

// ─── Members ───

export async function createMember(data: {
  programmeId: string
  parentName?: string
  parentEmail?: string
  parentWhatsappId?: string
  parentPhone?: string
  childName?: string
  childDob?: string
  medicalFlag?: boolean
  status?: string
  waitlistPosition?: number
}) {
  const { rows } = await sql`
    INSERT INTO members (programme_id, parent_name, parent_email, parent_whatsapp_id, parent_phone, child_name, child_dob, medical_flag, status, waitlist_position)
    VALUES (${data.programmeId}, ${data.parentName || null}, ${data.parentEmail || null}, ${data.parentWhatsappId || null}, ${data.parentPhone || null}, ${data.childName || null}, ${data.childDob || null}, ${data.medicalFlag || false}, ${data.status || 'active'}, ${data.waitlistPosition || null})
    RETURNING *
  `
  // Update programme member count
  await sql`UPDATE programmes SET current_members = (SELECT COUNT(*) FROM members WHERE programme_id = ${data.programmeId} AND status = 'active') WHERE id = ${data.programmeId}`
  return rows[0]
}

export async function listMembersByProgramme(programmeId: string) {
  const { rows } = await sql`SELECT * FROM members WHERE programme_id = ${programmeId} ORDER BY joined_at DESC`
  return rows
}

export async function listMembersByCoach(coachId: string) {
  const { rows } = await sql`
    SELECT m.*, p.programme_name
    FROM members m
    JOIN programmes p ON p.id = m.programme_id
    WHERE p.coach_id = ${coachId}
    ORDER BY m.joined_at DESC
  `
  return rows
}

export async function findMemberByWhatsApp(whatsappId: string) {
  const { rows } = await sql`SELECT * FROM members WHERE parent_whatsapp_id = ${whatsappId} LIMIT 1`
  return rows[0] || null
}

export async function findMemberByPhone(phone: string) {
  const { rows } = await sql`
    SELECT m.*, p.programme_name, p.id as programme_id
    FROM members m
    JOIN programmes p ON p.id = m.programme_id
    WHERE m.parent_phone = ${phone} OR m.parent_whatsapp_id = ${phone}
    ORDER BY m.joined_at DESC
  `
  return rows
}

// ─── Conversations ───

export async function logConversation(data: {
  programmeId?: string
  coachId?: string
  senderName?: string
  senderIdentifier?: string
  senderType?: string
  channel: string
  messageText: string
  category?: string
  botResponse?: string
  botMode?: string
  score?: string
  escalated?: boolean
  escalationType?: string
  memberId?: string
}) {
  const { rows } = await sql`
    INSERT INTO conversations (programme_id, coach_id, sender_name, sender_identifier, sender_type, channel, message_text, category, bot_response, bot_mode, score, escalated, escalation_type, member_id)
    VALUES (${data.programmeId || null}, ${data.coachId || null}, ${data.senderName || null}, ${data.senderIdentifier || null}, ${data.senderType || null}, ${data.channel}, ${data.messageText}, ${data.category || null}, ${data.botResponse || null}, ${data.botMode || null}, ${data.score || null}, ${data.escalated || false}, ${data.escalationType || null}, ${data.memberId || null})
    RETURNING *
  `
  return rows[0]
}

export async function getConversationStats(coachId: string, days: number = 7) {
  const { rows } = await sql`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE bot_response IS NOT NULL AND NOT escalated) as bot_handled,
      COUNT(*) FILTER (WHERE escalated) as escalated,
      COUNT(DISTINCT category) as categories
    FROM conversations
    WHERE coach_id = ${coachId} AND created_at > NOW() - (${days} || ' days')::INTERVAL
  `
  return rows[0]
}

export async function getTopCategories(coachId: string, limit: number = 5) {
  const { rows } = await sql`
    SELECT category, COUNT(*) as count
    FROM conversations
    WHERE coach_id = ${coachId} AND category IS NOT NULL
    GROUP BY category
    ORDER BY count DESC
    LIMIT ${limit}
  `
  return rows
}

// ─── Payments ───

export async function createPayment(data: {
  memberId: string
  programmeId: string
  amountGbp: number
  paymentType?: string
  paymentMethod?: string
  dueDate?: string
  status?: string
}) {
  const { rows } = await sql`
    INSERT INTO payments (member_id, programme_id, amount_gbp, payment_type, payment_method, due_date, status)
    VALUES (${data.memberId}, ${data.programmeId}, ${data.amountGbp}, ${data.paymentType || null}, ${data.paymentMethod || null}, ${data.dueDate || null}, ${data.status || 'pending'})
    RETURNING *
  `
  return rows[0]
}

export async function getPaymentStats(coachId: string) {
  const { rows } = await sql`
    SELECT
      COALESCE(SUM(py.amount_gbp) FILTER (WHERE py.status = 'paid' AND py.paid_at > date_trunc('month', NOW())), 0) as revenue_this_month,
      COALESCE(SUM(py.amount_gbp) FILTER (WHERE py.status IN ('pending', 'overdue')), 0) as outstanding,
      COUNT(*) FILTER (WHERE py.status = 'overdue') as overdue_count
    FROM payments py
    JOIN programmes p ON p.id = py.programme_id
    WHERE p.coach_id = ${coachId}
  `
  return rows[0]
}

export async function listPaymentsByCoach(coachId: string) {
  const { rows } = await sql`
    SELECT py.*, m.parent_name, m.child_name, p.programme_name
    FROM payments py
    JOIN members m ON m.id = py.member_id
    JOIN programmes p ON p.id = py.programme_id
    WHERE p.coach_id = ${coachId}
    ORDER BY py.created_at DESC
    LIMIT 50
  `
  return rows
}

// ─── Dashboard Stats ───

export async function getDashboardStats(coachId: string) {
  const { rows } = await sql`
    SELECT
      (SELECT COUNT(*) FROM members m JOIN programmes p ON p.id = m.programme_id WHERE p.coach_id = ${coachId} AND m.status = 'active') as active_members,
      (SELECT COUNT(*) FROM programmes WHERE coach_id = ${coachId} AND is_active = true) as active_programmes,
      (SELECT COALESCE(SUM(py.amount_gbp), 0) FROM payments py JOIN programmes p ON p.id = py.programme_id WHERE p.coach_id = ${coachId} AND py.status = 'paid' AND py.paid_at > date_trunc('month', NOW())) as revenue_this_month,
      (SELECT COALESCE(SUM(py.amount_gbp), 0) FROM payments py JOIN programmes p ON p.id = py.programme_id WHERE p.coach_id = ${coachId} AND py.status IN ('pending', 'overdue')) as outstanding,
      (SELECT COUNT(*) FROM conversations WHERE coach_id = ${coachId} AND created_at > NOW() - INTERVAL '7 days') as bot_interactions_week,
      (SELECT COUNT(*) FROM conversations WHERE coach_id = ${coachId} AND escalated = true AND created_at > NOW() - INTERVAL '7 days') as escalated_week,
      (SELECT COUNT(*) FROM faqs f JOIN programmes p ON p.id = f.programme_id WHERE p.coach_id = ${coachId} AND f.status = 'pending_coach_approval') as pending_faqs
  `
  return rows[0]
}
