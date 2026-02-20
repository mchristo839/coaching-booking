// app/api/sessions/create/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { sessionsTable } from '@/app/lib/airtable'

// Calculate how many sessions to generate for a recurrence rule
function getRecurrenceCount(rule: string): number {
  switch (rule) {
    case 'Weekly': return 13    // ~3 months
    case 'Biweekly': return 7   // ~3.5 months
    case 'Monthly': return 6    // 6 months
    default: return 1
  }
}

// Get the interval in days for a recurrence rule
function getIntervalDays(rule: string): number {
  switch (rule) {
    case 'Weekly': return 7
    case 'Biweekly': return 14
    case 'Monthly': return 30  // approximate, good enough for scheduling
    default: return 0
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      coachId,
      sessionName,
      sessionType,
      dateTime,
      durationMinutes,
      capacity,
      ageGroup,
      skillLevel,
      priceCents,
      injuryNotes,
      recurrenceRule,
      recurrenceEndDate,
    } = body

    if (!coachId || !sessionName || !sessionType || !dateTime || !durationMinutes || !capacity || !ageGroup || !skillLevel || !priceCents) {
      return NextResponse.json(
        { error: 'Missing required fields. Session name is required.' },
        { status: 400 }
      )
    }

    const rule = recurrenceRule || 'None'
    const intervalDays = getIntervalDays(rule)
    let count = getRecurrenceCount(rule)

    // If recurrenceEndDate is set, cap the count
    const endDate = recurrenceEndDate ? new Date(recurrenceEndDate) : null

    // Build the array of session records to create
    const sessionRecords = []
    const startDate = new Date(dateTime)

    for (let i = 0; i < count; i++) {
      const sessionDate = new Date(startDate)
      if (i > 0) {
        sessionDate.setDate(sessionDate.getDate() + (intervalDays * i))
      }

      // Stop if we've passed the recurrence end date
      if (endDate && sessionDate > endDate) break

      sessionRecords.push({
        fields: {
          coach_id: [coachId],
          session_name: sessionName,
          session_type: sessionType,
          date_time: sessionDate.toISOString(),
          duration_minutes: Number(durationMinutes),
          capacity: Number(capacity),
          age_group: ageGroup,
          skill_level: skillLevel,
          price_cents: Number(priceCents),
          injury_notes: injuryNotes || '',
          recurrence_rule: rule,
          ...(recurrenceEndDate ? { recurrence_end_date: recurrenceEndDate } : {}),
        },
      })
    }

    console.log(`[API sessions/create] Creating ${sessionRecords.length} session(s) for rule: ${rule}`)

    // Airtable create() accepts max 10 records per call, so batch them
    const createdIds: string[] = []
    for (let i = 0; i < sessionRecords.length; i += 10) {
      const batch = sessionRecords.slice(i, i + 10)
      const records = await sessionsTable.create(batch)
      records.forEach((r) => createdIds.push(r.id))
    }

    return NextResponse.json({
      success: true,
      sessionIds: createdIds,
      count: createdIds.length,
    })
  } catch (error) {
    console.error('Create session error:', error)
    return NextResponse.json(
      { error: 'Failed to create session. Please try again.' },
      { status: 500 }
    )
  }
}
