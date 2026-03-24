// app/api/sessions/create/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createSessions } from '@/app/lib/db'

function getRecurrenceCount(rule: string): number {
  switch (rule) {
    case 'Weekly': return 13
    case 'Biweekly': return 7
    case 'Monthly': return 6
    default: return 1
  }
}

function getIntervalDays(rule: string): number {
  switch (rule) {
    case 'Weekly': return 7
    case 'Biweekly': return 14
    case 'Monthly': return 30
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
    const count = getRecurrenceCount(rule)
    const endDate = recurrenceEndDate ? new Date(recurrenceEndDate) : null

    const sessionRecords = []
    const startDate = new Date(dateTime)

    for (let i = 0; i < count; i++) {
      const sessionDate = new Date(startDate)
      if (i > 0) {
        sessionDate.setDate(sessionDate.getDate() + (intervalDays * i))
      }
      if (endDate && sessionDate > endDate) break

      sessionRecords.push({
        coach_id: coachId,
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
        recurrence_end_date: recurrenceEndDate,
      })
    }

    console.log(`[API sessions/create] Creating ${sessionRecords.length} session(s) for rule: ${rule}`)

    const createdIds = await createSessions(sessionRecords)

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
