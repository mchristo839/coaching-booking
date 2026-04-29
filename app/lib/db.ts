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
  vertical?: 'sport' | 'fitness'
}) {
  const gb = data.governingBody ? `{${data.governingBody.join(',')}}` : null
  const vertical = data.vertical === 'fitness' ? 'fitness' : 'sport'
  const { rows } = await sql`
    INSERT INTO coaches_v2 (provider_id, first_name, last_name, email, mobile, sport, coaching_level, dbs_status, dbs_issue_date, governing_body, first_aid, public_liability, vertical)
    VALUES (${data.providerId}, ${data.firstName}, ${data.lastName}, ${data.email}, ${data.mobile}, ${data.sport || null}, ${data.coachingLevel || null}, ${data.dbsStatus || null}, ${data.dbsIssueDate || null}, ${gb}, ${data.firstAid || null}, ${data.publicLiability || null}, ${vertical})
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
  // Phase 7 additions
  seasonType?: string                  // autumn_winter | spring_summer | full_year | custom
  seasonStartDate?: string             // ISO date string (YYYY-MM-DD)
  seasonEndDate?: string
  skillLevels?: string[]               // multi-select; first value mirrored into skill_level
  sessionSchedule?: SessionScheduleEntry[]
}

export interface SessionScheduleEntry {
  day: string                          // 'Monday' | ... | 'Sunday'
  startTime: string                    // '17:30'
  durationMins: number                 // 60, 75, 90, ...
}

export async function createProgramme(data: ProgrammeData) {
  const days = data.sessionDays ? `{${data.sessionDays.join(',')}}` : null
  const methods = data.paymentMethods ? `{${data.paymentMethods.join(',')}}` : null
  const skills = data.skillLevels && data.skillLevels.length > 0
    ? `{${data.skillLevels.join(',')}}`
    : null
  // Mirror first selected skill into the legacy single column.
  const legacySkill = data.skillLevels?.[0] ?? data.skillLevel ?? null
  const sessionSchedule = data.sessionSchedule && data.sessionSchedule.length > 0
    ? JSON.stringify(data.sessionSchedule)
    : null
  // Mirror first row into legacy single time/duration so older read paths
  // still work without a code change.
  const legacyStart = data.sessionStartTime || data.sessionSchedule?.[0]?.startTime || null
  const legacyDuration = data.sessionDuration
    || (data.sessionSchedule?.[0]?.durationMins != null
      ? `${data.sessionSchedule[0].durationMins} mins`
      : null)
  const { rows } = await sql`
    INSERT INTO programmes (
      coach_id, programme_name, short_description, target_audience, specific_age_group,
      skill_level, skill_levels, programme_type, season_type, season_start_date, season_end_date,
      session_days, session_start_time, session_duration, session_schedule,
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
      ${legacySkill}, ${skills}, ${data.programmeType || null}, ${data.seasonType || null}, ${data.seasonStartDate || null}, ${data.seasonEndDate || null},
      ${days}, ${legacyStart}, ${legacyDuration}, ${sessionSchedule}::jsonb,
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
  // Build individual UPDATE statements for each provided field
  // This avoids the Neon parameter limit issue with 30+ params in one query
  const v = (val: string | undefined | null) => val && val.trim() ? val.trim() : null

  const updates: Promise<unknown>[] = []

  if (fields.programmeName !== undefined && fields.programmeName) updates.push(sql`UPDATE programmes SET programme_name = ${fields.programmeName}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.shortDescription !== undefined) updates.push(sql`UPDATE programmes SET short_description = ${v(fields.shortDescription)}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.targetAudience !== undefined) updates.push(sql`UPDATE programmes SET target_audience = ${v(fields.targetAudience)}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.specificAgeGroup !== undefined) updates.push(sql`UPDATE programmes SET specific_age_group = ${v(fields.specificAgeGroup)}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.skillLevel !== undefined) updates.push(sql`UPDATE programmes SET skill_level = ${v(fields.skillLevel)}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.programmeType !== undefined) updates.push(sql`UPDATE programmes SET programme_type = ${v(fields.programmeType)}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.sessionDays !== undefined && fields.sessionDays.length > 0) {
    const days = `{${fields.sessionDays.join(',')}}`
    updates.push(sql`UPDATE programmes SET session_days = ${days}, updated_at = NOW() WHERE id = ${programmeId}`)
  }
  if (fields.sessionStartTime !== undefined) updates.push(sql`UPDATE programmes SET session_start_time = ${v(fields.sessionStartTime)}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.sessionDuration !== undefined) updates.push(sql`UPDATE programmes SET session_duration = ${v(fields.sessionDuration)}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.sessionFrequency !== undefined) updates.push(sql`UPDATE programmes SET session_frequency = ${v(fields.sessionFrequency)}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.holidaySchedule !== undefined) updates.push(sql`UPDATE programmes SET holiday_schedule = ${v(fields.holidaySchedule)}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.cancellationNotice !== undefined) updates.push(sql`UPDATE programmes SET cancellation_notice = ${v(fields.cancellationNotice)}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.venueName !== undefined) updates.push(sql`UPDATE programmes SET venue_name = ${v(fields.venueName)}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.venueAddress !== undefined) updates.push(sql`UPDATE programmes SET venue_address = ${v(fields.venueAddress)}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.parking !== undefined) updates.push(sql`UPDATE programmes SET parking = ${v(fields.parking)}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.nearestTransport !== undefined) updates.push(sql`UPDATE programmes SET nearest_transport = ${v(fields.nearestTransport)}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.indoorOutdoor !== undefined) updates.push(sql`UPDATE programmes SET indoor_outdoor = ${v(fields.indoorOutdoor)}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.badWeatherPolicy !== undefined) updates.push(sql`UPDATE programmes SET bad_weather_policy = ${v(fields.badWeatherPolicy)}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.maxCapacity !== undefined) updates.push(sql`UPDATE programmes SET max_capacity = ${fields.maxCapacity}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.fullThreshold !== undefined) updates.push(sql`UPDATE programmes SET full_threshold = ${v(fields.fullThreshold) || 'at_100'}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.waitlistEnabled !== undefined) updates.push(sql`UPDATE programmes SET waitlist_enabled = ${fields.waitlistEnabled}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.referralTrigger !== undefined) updates.push(sql`UPDATE programmes SET referral_trigger = ${v(fields.referralTrigger)}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.referralIncentive !== undefined) updates.push(sql`UPDATE programmes SET referral_incentive = ${v(fields.referralIncentive)}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.programmeStatus !== undefined) updates.push(sql`UPDATE programmes SET programme_status = ${v(fields.programmeStatus) || 'open'}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.trialAvailable !== undefined) updates.push(sql`UPDATE programmes SET trial_available = ${v(fields.trialAvailable)}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.trialInstructions !== undefined) updates.push(sql`UPDATE programmes SET trial_instructions = ${v(fields.trialInstructions)}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.whatToBring !== undefined) updates.push(sql`UPDATE programmes SET what_to_bring = ${v(fields.whatToBring)}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.equipmentProvided !== undefined) updates.push(sql`UPDATE programmes SET equipment_provided = ${v(fields.equipmentProvided)}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.kitRequired !== undefined) updates.push(sql`UPDATE programmes SET kit_required = ${v(fields.kitRequired)}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.kitDetails !== undefined) updates.push(sql`UPDATE programmes SET kit_details = ${v(fields.kitDetails)}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.paidOrFree !== undefined) updates.push(sql`UPDATE programmes SET paid_or_free = ${v(fields.paidOrFree) || 'paid'}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.paymentModel !== undefined) updates.push(sql`UPDATE programmes SET payment_model = ${v(fields.paymentModel)}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.priceGbp !== undefined) updates.push(sql`UPDATE programmes SET price_gbp = ${fields.priceGbp}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.priceIncludes !== undefined) updates.push(sql`UPDATE programmes SET price_includes = ${v(fields.priceIncludes)}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.siblingDiscount !== undefined) updates.push(sql`UPDATE programmes SET sibling_discount = ${v(fields.siblingDiscount)}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.refundPolicy !== undefined) updates.push(sql`UPDATE programmes SET refund_policy = ${v(fields.refundPolicy)}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.refundDetails !== undefined) updates.push(sql`UPDATE programmes SET refund_details = ${v(fields.refundDetails)}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.paymentMethods !== undefined && fields.paymentMethods.length > 0) {
    const methods = `{${fields.paymentMethods.join(',')}}`
    updates.push(sql`UPDATE programmes SET payment_methods = ${methods}, updated_at = NOW() WHERE id = ${programmeId}`)
  }
  if (fields.paymentReminderSchedule !== undefined) updates.push(sql`UPDATE programmes SET payment_reminder_schedule = ${v(fields.paymentReminderSchedule)}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.botNotes !== undefined) updates.push(sql`UPDATE programmes SET bot_notes = ${v(fields.botNotes)}, updated_at = NOW() WHERE id = ${programmeId}`)
  if (fields.whatsappGroupId !== undefined && fields.whatsappGroupId) updates.push(sql`UPDATE programmes SET whatsapp_group_id = ${fields.whatsappGroupId}, updated_at = NOW() WHERE id = ${programmeId}`)

  // Run all updates in parallel
  await Promise.all(updates)

  // Read back the final state
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

// ═══════════════════════════════════════════════════════════
// Week 1 operational functions
// ═══════════════════════════════════════════════════════════

// ─── Backward-compat wrappers for webhook handler ───

export interface Knowledgebase {
  sport: string
  venue: string
  venueAddress: string
  ageGroup: string
  skillLevel: string
  schedule: string
  priceCents: number
  whatToBring: string
  cancellationPolicy: string
  medicalInfo: string
  coachBio: string
  customFaqs: { q: string; a: string }[]
}

export async function findProgramByWhatsAppGroup(whatsappGroupId: string) {
  const result = await findProgrammeByWhatsAppGroup(whatsappGroupId)
  if (!result) return null

  // Build a knowledgebase object from V2 individual columns + FAQs
  const { rows: faqRows } = await sql`
    SELECT question, answer FROM faqs
    WHERE programme_id = ${result.id} AND status = 'active'
  `

  const knowledgebase: Knowledgebase = {
    sport: result.target_audience || '',
    venue: result.venue_name || '',
    venueAddress: result.venue_address || '',
    ageGroup: result.specific_age_group || '',
    skillLevel: result.skill_level || '',
    schedule: result.session_days
      ? `${(result.session_days || []).join(', ')} ${result.session_start_time || ''} (${result.session_duration || ''})`
      : '',
    priceCents: result.price_gbp ? Math.round(Number(result.price_gbp) * 100) : 0,
    whatToBring: result.what_to_bring || '',
    cancellationPolicy: result.cancellation_notice || '',
    medicalInfo: result.bot_notes || '',
    coachBio: result.short_description || '',
    customFaqs: faqRows.map((f) => ({ q: String(f.question || ''), a: String(f.answer || '') })),
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapped: any = { ...result }
  mapped.program_name = result.programme_name
  mapped.coach_name = `${result.coach_first_name} ${result.coach_last_name}`.trim()
  mapped.coach_email = result.coach_email
  mapped.knowledgebase = knowledgebase
  return mapped
}

// ─── Conversation logging ───

export interface ConversationRow {
  programmeId?: string | null
  groupJid: string
  senderJid?: string | null
  senderName?: string | null
  messageText: string
  botResponse?: string | null
  category?: string | null
  escalated?: boolean
}

export async function safeLogConversation(
  row: ConversationRow
): Promise<{ success: boolean; conversationId?: string; error?: string }> {
  try {
    console.log('[LOG] Inserting conversation:', {
      groupJid: row.groupJid,
      senderName: row.senderName,
      category: row.category,
      escalated: row.escalated,
      hasResponse: !!row.botResponse,
    })

    const { rows } = await sql`
      INSERT INTO conversations (
        programme_id, group_jid, sender_identifier, sender_name,
        message_text, bot_response, category, escalated, channel
      ) VALUES (
        ${row.programmeId ?? null},
        ${row.groupJid},
        ${row.senderJid ?? null},
        ${row.senderName ?? null},
        ${row.messageText},
        ${row.botResponse ?? null},
        ${row.category ?? null},
        ${row.escalated ?? false},
        'whatsapp'
      )
      RETURNING id
    `

    const id = rows[0]?.id
    console.log('[LOG] Conversation logged, id:', id)
    return { success: true, conversationId: id }
  } catch (error) {
    console.error('[LOG-ERROR] Failed to log conversation:', error, row)
    return { success: false, error: String(error) }
  }
}

// ─── Message Dedup ───

export async function isMessageProcessed(messageId: string): Promise<boolean> {
  try {
    const { rows } = await sql`
      SELECT message_id FROM processed_messages WHERE message_id = ${messageId} LIMIT 1
    `
    if (rows.length > 0) return true
    await sql`INSERT INTO processed_messages (message_id) VALUES (${messageId}) ON CONFLICT (message_id) DO NOTHING`
    return false
  } catch (error) {
    console.error('[LOG-ERROR] Message dedup check failed:', error)
    return false
  }
}

// ─── Bot Reply Tracking ───

export async function trackBotReply(
  groupJid: string,
  replyType: string,
  messageId?: string
): Promise<{ isDuplicate: boolean }> {
  try {
    const { rows } = await sql`
      SELECT id FROM bot_replies
      WHERE group_jid = ${groupJid} AND reply_type = ${replyType} AND sent_at > NOW() - INTERVAL '10 seconds'
      LIMIT 1
    `
    if (rows.length > 0) {
      console.log(`[SKIP-DUPLICATE] Duplicate bot reply detected: ${groupJid} ${replyType}`)
      return { isDuplicate: true }
    }
    await sql`INSERT INTO bot_replies (group_jid, reply_type, message_id) VALUES (${groupJid}, ${replyType}, ${messageId ?? null})`
    return { isDuplicate: false }
  } catch (error) {
    console.error('[LOG-ERROR] Bot reply tracking failed:', error)
    return { isDuplicate: false }
  }
}

export async function cleanupProcessedMessages(): Promise<number> {
  const { rowCount } = await sql`DELETE FROM processed_messages WHERE processed_at < NOW() - INTERVAL '24 hours'`
  return rowCount ?? 0
}

// ─── Invite Codes ───

export async function createInviteCode(code: string, createdBy: string, maxUses: number, expiresAt: string | null, notes: string | null) {
  const { rows } = await sql`INSERT INTO invite_codes (code, created_by, max_uses, expires_at, notes) VALUES (${code}, ${createdBy}, ${maxUses}, ${expiresAt}, ${notes}) RETURNING *`
  return rows[0]
}

export async function listInviteCodes() {
  const { rows } = await sql`SELECT * FROM invite_codes ORDER BY created_at DESC`
  return rows
}

export async function validateInviteCode(code: string): Promise<{ valid: boolean; error?: string }> {
  const { rows } = await sql`SELECT * FROM invite_codes WHERE code = ${code} LIMIT 1`
  if (rows.length === 0) return { valid: false, error: 'Invalid invite code' }
  const invite = rows[0]
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) return { valid: false, error: 'Invite code has expired' }
  if (invite.uses >= invite.max_uses) return { valid: false, error: 'Invite code has reached its maximum uses' }
  return { valid: true }
}

export async function useInviteCode(code: string) {
  await sql`UPDATE invite_codes SET uses = uses + 1 WHERE code = ${code}`
}

export async function createCoachWithInvite(email: string, name: string, passwordHash: string, inviteCode: string) {
  const { rows } = await sql`INSERT INTO coaches (email, name, password_hash, invite_code, is_tester) VALUES (${email}, ${name}, ${passwordHash}, ${inviteCode}, true) RETURNING *`
  return rows[0]
}

// ─── Legacy coach functions (old coaches table, still used by signup + webhook) ───

export async function findCoachByEmail(email: string) {
  const { rows } = await sql`SELECT * FROM coaches WHERE email = ${email} LIMIT 1`
  return rows[0] || null
}

export async function createLegacyCoach(email: string, name: string, passwordHash: string) {
  const { rows } = await sql`INSERT INTO coaches (email, name, password_hash) VALUES (${email}, ${name}, ${passwordHash}) RETURNING *`
  return rows[0]
}
