export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { listProgrammesByCoach, listFaqsByProgramme } from '@/app/lib/db'

// Map DB rows to camelCase — supports both snake_case and already-camelCase keys
// because @vercel/postgres behavior can vary
function mapProgramme(row: Record<string, unknown>) {
  const g = (snake: string, camel: string) => row[snake] ?? row[camel] ?? null
  return {
    id: row.id,
    programName: g('programme_name', 'programmeName') || g('program_name', 'programName'),
    programmeName: g('programme_name', 'programmeName') || g('program_name', 'programName'),
    shortDescription: g('short_description', 'shortDescription'),
    targetAudience: g('target_audience', 'targetAudience'),
    specificAgeGroup: g('specific_age_group', 'specificAgeGroup'),
    skillLevel: g('skill_level', 'skillLevel'),
    programmeType: g('programme_type', 'programmeType'),
    sessionDays: g('session_days', 'sessionDays'),
    sessionStartTime: g('session_start_time', 'sessionStartTime'),
    sessionDuration: g('session_duration', 'sessionDuration'),
    sessionFrequency: g('session_frequency', 'sessionFrequency'),
    holidaySchedule: g('holiday_schedule', 'holidaySchedule'),
    cancellationNotice: g('cancellation_notice', 'cancellationNotice'),
    venueName: g('venue_name', 'venueName'),
    venueAddress: g('venue_address', 'venueAddress'),
    parking: row.parking,
    nearestTransport: g('nearest_transport', 'nearestTransport'),
    indoorOutdoor: g('indoor_outdoor', 'indoorOutdoor'),
    badWeatherPolicy: g('bad_weather_policy', 'badWeatherPolicy'),
    maxCapacity: g('max_capacity', 'maxCapacity'),
    currentMembers: g('current_members', 'currentMembers'),
    fullThreshold: g('full_threshold', 'fullThreshold'),
    waitlistEnabled: g('waitlist_enabled', 'waitlistEnabled'),
    referralTrigger: g('referral_trigger', 'referralTrigger'),
    referralIncentive: g('referral_incentive', 'referralIncentive'),
    programmeStatus: g('programme_status', 'programmeStatus'),
    trialAvailable: g('trial_available', 'trialAvailable'),
    trialInstructions: g('trial_instructions', 'trialInstructions'),
    whatToBring: g('what_to_bring', 'whatToBring'),
    equipmentProvided: g('equipment_provided', 'equipmentProvided'),
    kitRequired: g('kit_required', 'kitRequired'),
    kitDetails: g('kit_details', 'kitDetails'),
    paidOrFree: g('paid_or_free', 'paidOrFree'),
    paymentModel: g('payment_model', 'paymentModel'),
    priceGbp: g('price_gbp', 'priceGbp'),
    priceIncludes: g('price_includes', 'priceIncludes'),
    siblingDiscount: g('sibling_discount', 'siblingDiscount'),
    refundPolicy: g('refund_policy', 'refundPolicy'),
    refundDetails: g('refund_details', 'refundDetails'),
    paymentMethods: g('payment_methods', 'paymentMethods'),
    paymentReminderSchedule: g('payment_reminder_schedule', 'paymentReminderSchedule'),
    botNotes: g('bot_notes', 'botNotes'),
    whatsappGroupId: g('whatsapp_group_id', 'whatsappGroupId'),
    isActive: g('is_active', 'isActive'),
    createdAt: g('created_at', 'createdAt'),
    memberCount: Number(g('member_count', 'memberCount') || 0),
    waitlistCount: Number(g('waitlist_count', 'waitlistCount') || 0),
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
