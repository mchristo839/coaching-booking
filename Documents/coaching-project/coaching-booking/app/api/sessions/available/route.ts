// app/api/sessions/available/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { sessionsTable } from '@/app/lib/airtable'

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

    const now = new Date().toISOString()

    // Fetch all sessions, filter in JS to avoid linked record formula issues
    const allRecords = await sessionsTable
      .select({
        sort: [{ field: 'date_time', direction: 'asc' }],
      })
      .firstPage()

    const sessions = allRecords
      .filter((record) => {
        // Match coach
        const linkedCoachIds = record.get('coach_id')
        let coachMatch = false
        if (Array.isArray(linkedCoachIds)) {
          coachMatch = linkedCoachIds.includes(coachId)
        } else if (typeof linkedCoachIds === 'string') {
          coachMatch = linkedCoachIds === coachId
        }
        if (!coachMatch) return false

        // Only future sessions
        const dateTime = record.get('date_time') as string
        if (!dateTime || dateTime < now) return false

        // Only sessions with open spots
        const capacity = (record.get('capacity') as number) || 0
        const bookedCount = (record.get('booked_count') as number) || 0
        if (bookedCount >= capacity) return false

        return true
      })
      .map((record) => ({
        id: record.id,
        sessionName: record.get('session_name') || '',
        sessionType: record.get('session_type'),
        dateTime: record.get('date_time'),
        durationMinutes: record.get('duration_minutes'),
        capacity: record.get('capacity') as number,
        bookedCount: (record.get('booked_count') as number) || 0,
        ageGroup: record.get('age_group'),
        skillLevel: record.get('skill_level'),
        priceCents: record.get('price_cents'),
        injuryNotes: record.get('injury_notes'),
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
