import { NextRequest, NextResponse } from 'next/server'
import { createProgramme, createFaqsBulk, updateProvider, findCoachById, findCoachByProviderId, type ProgrammeData } from '@/app/lib/db'
import { getAuthFromRequest, signJwt, setAuthCookie } from '@/app/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthFromRequest(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // If the JWT has no coachId (stale token from before coach-creation),
    // fall back to looking up the coach_v2 row by provider_id. This
    // self-heals anyone whose token was issued at signup before the coach
    // profile existed.
    let resolvedCoachId: string | null = auth.coachId
    let jwtNeedsRefresh = false
    if (!resolvedCoachId) {
      const coach = await findCoachByProviderId(auth.providerId)
      if (coach) {
        resolvedCoachId = coach.id as string
        jwtNeedsRefresh = true
      } else {
        return NextResponse.json({ error: 'No coach profile linked' }, { status: 400 })
      }
    }
    const coachId: string = resolvedCoachId

    const body = await request.json()
    const { faqs, ...rest } = body

    // Accept both 'programmeName' and 'name' for flexibility
    const programmeName = rest.programmeName || rest.name
    if (!programmeName) {
      return NextResponse.json({ error: 'Programme name is required' }, { status: 400 })
    }

    // Map registration form field names → db field names
    const programmeData: ProgrammeData = {
      coachId,
      programmeName,
      shortDescription: rest.shortDescription || rest.description || null,
      targetAudience: rest.targetAudience || rest.audience || null,
      specificAgeGroup: rest.specificAgeGroup || rest.specificAgeGroup || null,
      skillLevel: rest.skillLevel || null,
      programmeType: rest.programmeType || rest.runType || null,
      sessionDays: rest.sessionDays || null,
      sessionStartTime: rest.sessionStartTime || rest.sessionTime || null,
      sessionDuration: rest.sessionDuration || null,
      sessionFrequency: rest.sessionFrequency || null,
      holidaySchedule: rest.holidaySchedule || null,
      cancellationNotice: rest.cancellationNotice || null,
      venueName: rest.venueName || null,
      venueAddress: rest.venueAddress || null,
      parking: rest.parking || null,
      nearestTransport: rest.nearestTransport || rest.publicTransport || null,
      indoorOutdoor: rest.indoorOutdoor || null,
      badWeatherPolicy: rest.badWeatherPolicy || rest.badWeather || null,
      maxCapacity: rest.maxCapacity ? Number(rest.maxCapacity) : undefined,
      programmeStatus: rest.programmeStatus || rest.status || rest.progStatus || 'open',
      trialAvailable: rest.trialAvailable || rest.trialSession || null,
      waitlistEnabled: rest.waitlistEnabled !== undefined ? rest.waitlistEnabled : (rest.waitlist === 'yes' || true),
      whatToBring: rest.whatToBring || null,
      equipmentProvided: rest.equipmentProvided || null,
      kitRequired: rest.kitRequired || rest.kitRequirement || null,
      paidOrFree: rest.paidOrFree || rest.paidFree || 'paid',
      paymentModel: rest.paymentModel || null,
      priceGbp: rest.priceGbp || rest.price ? Number(rest.priceGbp || rest.price) : undefined,
      priceIncludes: rest.priceIncludes || null,
      siblingDiscount: rest.siblingDiscount || null,
      refundPolicy: rest.refundPolicy || null,
      refundDetails: rest.refundDetails || null,
      paymentMethods: rest.paymentMethods || null,
      botNotes: rest.botNotes || null,
      whatsappGroupId: rest.whatsappGroupId || null,
      referralTrigger: rest.referralTrigger || null,
      referralIncentive: rest.referralIncentive || null,
      fullThreshold: rest.fullThreshold || 'at_100',
      kitDetails: rest.kitDetails || null,
      paymentReminderSchedule: rest.paymentReminderSchedule || null,
      trialInstructions: rest.trialInstructions || null,
    }

    const programme = await createProgramme(programmeData)

    // Create FAQs if provided
    if (faqs && Array.isArray(faqs) && faqs.length > 0) {
      await createFaqsBulk(
        programme.id,
        faqs.map((f: { question: string; answer: string; category?: string; source?: string }) => ({
          question: f.question,
          answer: f.answer,
          category: f.category || 'custom',
          source: f.source || 'coach',
        }))
      )
    }

    // Update provider registration status
    const coach = await findCoachById(coachId)
    if (coach) {
      await updateProvider(coach.provider_id, { registrationStatus: 'programme_added' })
    }

    const response = NextResponse.json({
      success: true,
      programmeId: programme.id,
      programmeName: programme.programme_name,
    })

    // Re-sign JWT with the resolved coachId so subsequent requests have it.
    if (jwtNeedsRefresh) {
      const token = await signJwt(auth.providerId, coachId)
      setAuthCookie(response, token)
    }

    return response
  } catch (error) {
    console.error('Create programme error:', error)
    return NextResponse.json({ error: 'Failed to create programme' }, { status: 500 })
  }
}
