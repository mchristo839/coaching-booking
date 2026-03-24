// app/api/sessions/list/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { listSessionsByCoach } from '@/app/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const coachId = searchParams.get('coachId')

    if (!coachId) {
      return NextResponse.json(
        { error: 'coachId is required' },
        { status: 400 }
      )
    }

    console.log('[API sessions/list] Fetching sessions for coachId:', coachId)

    const rows = await listSessionsByCoach(coachId)

    const sessions = rows.map((r) => ({
      id: r.id,
      sessionName: r.session_name || '',
      sessionType: r.session_type,
      dateTime: r.date_time,
      durationMinutes: r.duration_minutes,
      capacity: r.capacity,
      bookedCount: Number(r.booked_count) || 0,
      ageGroup: r.age_group,
      skillLevel: r.skill_level,
      priceCents: r.price_cents,
      injuryNotes: r.injury_notes,
      recurrenceRule: r.recurrence_rule || 'None',
    }))

    console.log('[API sessions/list] Sessions for coach:', sessions.length)

    return NextResponse.json({ sessions })
  } catch (error) {
    console.error('[API sessions/list] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sessions' },
      { status: 500 }
    )
  }
}
