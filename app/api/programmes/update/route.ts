import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { getAuthFromRequest } from '@/app/lib/auth'

export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuthFromRequest(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const coachId = auth.coachId
    if (!coachId) {
      return NextResponse.json({ error: 'No coach profile linked' }, { status: 400 })
    }

    const body = await request.json()
    const { programmeId, ...fields } = body

    if (!programmeId) {
      return NextResponse.json({ error: 'Programme ID required' }, { status: 400 })
    }

    // Verify ownership
    const { rows: ownerCheck } = await sql`SELECT id FROM programmes WHERE id = ${programmeId} AND coach_id = ${coachId}`
    if (ownerCheck.length === 0) {
      return NextResponse.json({ error: 'Programme not found or access denied' }, { status: 403 })
    }

    // Build SET clauses dynamically — direct SQL to avoid any abstraction issues
    const setClauses: string[] = []
    const values: unknown[] = []
    let paramIdx = 1

    const fieldMap: Record<string, string> = {
      programmeName: 'programme_name',
      shortDescription: 'short_description',
      targetAudience: 'target_audience',
      specificAgeGroup: 'specific_age_group',
      skillLevel: 'skill_level',
      programmeType: 'programme_type',
      sessionStartTime: 'session_start_time',
      sessionDuration: 'session_duration',
      sessionFrequency: 'session_frequency',
      holidaySchedule: 'holiday_schedule',
      cancellationNotice: 'cancellation_notice',
      venueName: 'venue_name',
      venueAddress: 'venue_address',
      parking: 'parking',
      nearestTransport: 'nearest_transport',
      indoorOutdoor: 'indoor_outdoor',
      badWeatherPolicy: 'bad_weather_policy',
      programmeStatus: 'programme_status',
      trialAvailable: 'trial_available',
      trialInstructions: 'trial_instructions',
      whatToBring: 'what_to_bring',
      equipmentProvided: 'equipment_provided',
      kitRequired: 'kit_required',
      kitDetails: 'kit_details',
      paidOrFree: 'paid_or_free',
      paymentModel: 'payment_model',
      priceIncludes: 'price_includes',
      siblingDiscount: 'sibling_discount',
      refundPolicy: 'refund_policy',
      refundDetails: 'refund_details',
      paymentReminderSchedule: 'payment_reminder_schedule',
      botNotes: 'bot_notes',
      whatsappGroupId: 'whatsapp_group_id',
      fullThreshold: 'full_threshold',
      referralTrigger: 'referral_trigger',
      referralIncentive: 'referral_incentive',
    }

    // Run individual UPDATE for each field that's provided
    for (const [camelKey, snakeKey] of Object.entries(fieldMap)) {
      if (fields[camelKey] !== undefined) {
        const val = typeof fields[camelKey] === 'string' && !fields[camelKey].trim() ? null : fields[camelKey]
        await sql.query(`UPDATE programmes SET ${snakeKey} = $1, updated_at = NOW() WHERE id = $2`, [val, programmeId])
      }
    }

    // Handle special fields
    if (fields.maxCapacity !== undefined) {
      await sql.query('UPDATE programmes SET max_capacity = $1, updated_at = NOW() WHERE id = $2', [fields.maxCapacity || null, programmeId])
    }
    if (fields.priceGbp !== undefined) {
      await sql.query('UPDATE programmes SET price_gbp = $1, updated_at = NOW() WHERE id = $2', [fields.priceGbp || null, programmeId])
    }
    if (fields.waitlistEnabled !== undefined) {
      await sql.query('UPDATE programmes SET waitlist_enabled = $1, updated_at = NOW() WHERE id = $2', [fields.waitlistEnabled, programmeId])
    }
    if (fields.sessionDays !== undefined && Array.isArray(fields.sessionDays) && fields.sessionDays.length > 0) {
      const days = `{${fields.sessionDays.join(',')}}`
      await sql.query('UPDATE programmes SET session_days = $1, updated_at = NOW() WHERE id = $2', [days, programmeId])
    }
    if (fields.paymentMethods !== undefined && Array.isArray(fields.paymentMethods) && fields.paymentMethods.length > 0) {
      const methods = `{${fields.paymentMethods.join(',')}}`
      await sql.query('UPDATE programmes SET payment_methods = $1, updated_at = NOW() WHERE id = $2', [methods, programmeId])
    }

    // Read back the final state
    const { rows } = await sql`SELECT * FROM programmes WHERE id = ${programmeId}`
    return NextResponse.json({ success: true, programme: rows[0] })
  } catch (error) {
    console.error('Update programme error:', error)
    return NextResponse.json({ error: `Failed to update programme: ${error instanceof Error ? error.message : 'Unknown'}` }, { status: 500 })
  }
}
