// app/api/sessions/available/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { listAvailableSessions } from '@/app/lib/db'

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

    console.log('[API sessions/available] Fetching for coachId:', coachId)

    const rows = await listAvailableSessions(coachId)

    const sessions = rows.map((r) => ({
      id: r.id,
      sessionName: r.session_name || '',
      sessionType: r.session_type,
      dateTime: r.date_time,
      durationMinutes: r.duration_minutes,
      capacity: r.capacity as number,
      bookedCount: Number(r.booked_count) || 0,
      ageGroup: r.age_group,
      skillLevel: r.skill_level,
      priceCents: r.price_cents,
      injuryNotes: r.injury_notes,
    }))

    console.log('[API sessions/available] Available sessions:', sessions.length)

    return NextResponse.json({ sessions })
  } catch (error) {
    console.error('[API sessions/available] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch available sessions' },
      { status: 500 }
    )
  }
}
