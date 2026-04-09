export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { listProgrammesByCoach, listFaqsByProgramme } from '@/app/lib/db'

// Map snake_case DB rows to camelCase for the frontend
function mapProgramme(row: Record<string, unknown>) {
  return {
    id: row.id,
    programName: row.programme_name,
    programmeName: row.programme_name,
    shortDescription: row.short_description,
    targetAudience: row.target_audience,
    specificAgeGroup: row.specific_age_group,
    skillLevel: row.skill_level,
    programmeType: row.programme_type,
    sessionDays: row.session_days,
    sessionStartTime: row.session_start_time,
    sessionDuration: row.session_duration,
    sessionFrequency: row.session_frequency,
    holidaySchedule: row.holiday_schedule,
    cancellationNotice: row.cancellation_notice,
    venueName: row.venue_name,
    venueAddress: row.venue_address,
    parking: row.parking,
    nearestTransport: row.nearest_transport,
    indoorOutdoor: row.indoor_outdoor,
    badWeatherPolicy: row.bad_weather_policy,
    maxCapacity: row.max_capacity,
    currentMembers: row.current_members,
    fullThreshold: row.full_threshold,
    waitlistEnabled: row.waitlist_enabled,
    referralTrigger: row.referral_trigger,
    referralIncentive: row.referral_incentive,
    programmeStatus: row.programme_status,
    trialAvailable: row.trial_available,
    trialInstructions: row.trial_instructions,
    whatToBring: row.what_to_bring,
    equipmentProvided: row.equipment_provided,
    kitRequired: row.kit_required,
    kitDetails: row.kit_details,
    paidOrFree: row.paid_or_free,
    paymentModel: row.payment_model,
    priceGbp: row.price_gbp,
    priceIncludes: row.price_includes,
    siblingDiscount: row.sibling_discount,
    refundPolicy: row.refund_policy,
    refundDetails: row.refund_details,
    paymentMethods: row.payment_methods,
    paymentReminderSchedule: row.payment_reminder_schedule,
    botNotes: row.bot_notes,
    whatsappGroupId: row.whatsapp_group_id,
    isActive: row.is_active,
    createdAt: row.created_at,
    // Computed fields from the query
    memberCount: row.member_count ? Number(row.member_count) : 0,
    waitlistCount: row.waitlist_count ? Number(row.waitlist_count) : 0,
  }
}

export async function GET(request: NextRequest) {
  try {
    const coachId = request.nextUrl.searchParams.get('coachId')
    if (!coachId) {
      return NextResponse.json({ error: 'Coach ID required' }, { status: 400 })
    }

    const rawProgrammes = await listProgrammesByCoach(coachId)
    const programmes = rawProgrammes.map(r => mapProgramme(r as Record<string, unknown>))

    // Optionally include FAQs
    const includeFaqs = request.nextUrl.searchParams.get('includeFaqs') === 'true'
    if (includeFaqs) {
      for (const prog of programmes) {
        (prog as Record<string, unknown>).faqs = await listFaqsByProgramme(prog.id as string)
      }
    }

    return NextResponse.json({ programmes })
  } catch (error) {
    console.error('List programmes error:', error)
    return NextResponse.json({ error: 'Failed to list programmes' }, { status: 500 })
  }
}
