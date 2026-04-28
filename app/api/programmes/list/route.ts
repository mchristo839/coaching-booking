export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { getAuthFromRequest } from '@/app/lib/auth'
import { findCoachByProviderId } from '@/app/lib/db'

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthFromRequest(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    let coachId = auth.coachId
    if (!coachId) {
      // Self-heal: JWT may have been signed before coach-create
      const coach = await findCoachByProviderId(auth.providerId)
      if (coach) coachId = coach.id
      else return NextResponse.json({ programmes: [] })
    }

    // Use sql.query() for consistent reads (template tag may use stale read replica)
    const { rows } = await sql.query(`
      SELECT
        p.id,
        p.programme_name as "programmeName",
        p.programme_name as "programName",
        p.short_description as "shortDescription",
        p.target_audience as "targetAudience",
        p.specific_age_group as "specificAgeGroup",
        p.skill_level as "skillLevel",
        p.skill_levels as "skillLevels",
        p.programme_type as "programmeType",
        p.season_type as "seasonType",
        p.season_start_date as "seasonStartDate",
        p.season_end_date as "seasonEndDate",
        p.session_days as "sessionDays",
        p.session_start_time as "sessionStartTime",
        p.session_duration as "sessionDuration",
        p.session_schedule as "sessionSchedule",
        p.session_frequency as "sessionFrequency",
        p.holiday_schedule as "holidaySchedule",
        p.cancellation_notice as "cancellationNotice",
        p.venue_name as "venueName",
        p.venue_address as "venueAddress",
        p.parking,
        p.nearest_transport as "nearestTransport",
        p.indoor_outdoor as "indoorOutdoor",
        p.bad_weather_policy as "badWeatherPolicy",
        p.max_capacity as "maxCapacity",
        p.current_members as "currentMembers",
        p.full_threshold as "fullThreshold",
        p.waitlist_enabled as "waitlistEnabled",
        p.referral_trigger as "referralTrigger",
        p.referral_incentive as "referralIncentive",
        p.programme_status as "programmeStatus",
        p.trial_available as "trialAvailable",
        p.trial_instructions as "trialInstructions",
        p.what_to_bring as "whatToBring",
        p.equipment_provided as "equipmentProvided",
        p.kit_required as "kitRequired",
        p.kit_details as "kitDetails",
        p.paid_or_free as "paidOrFree",
        p.payment_model as "paymentModel",
        p.price_gbp as "priceGbp",
        p.price_includes as "priceIncludes",
        p.sibling_discount as "siblingDiscount",
        p.refund_policy as "refundPolicy",
        p.refund_details as "refundDetails",
        p.payment_methods as "paymentMethods",
        p.payment_reminder_schedule as "paymentReminderSchedule",
        p.bot_notes as "botNotes",
        p.whatsapp_group_id as "whatsappGroupId",
        p.is_active as "isActive",
        p.created_at as "createdAt",
        (SELECT COUNT(*)::int FROM members m WHERE m.programme_id = p.id AND m.status = 'active') as "memberCount",
        (SELECT COUNT(*)::int FROM members m WHERE m.programme_id = p.id AND m.status = 'waitlisted') as "waitlistCount"
      FROM programmes p
      WHERE p.coach_id = $1 AND p.is_active = true
      ORDER BY p.created_at DESC
    `, [coachId])

    // Optionally include FAQs
    const includeFaqs = request.nextUrl.searchParams.get('includeFaqs') === 'true'
    if (includeFaqs) {
      for (const prog of rows) {
        const faqResult = await sql.query('SELECT * FROM faqs WHERE programme_id = $1 ORDER BY created_at', [prog.id])
        ;(prog as Record<string, unknown>).faqs = faqResult.rows
      }
    }

    return NextResponse.json(
      { programmes: rows },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' } }
    )
  } catch (error) {
    console.error('List programmes error:', error)
    return NextResponse.json({ error: 'Failed to list programmes' }, { status: 500 })
  }
}
