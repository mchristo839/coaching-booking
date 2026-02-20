// app/api/sessions/list/route.ts
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

    console.log('[API sessions/list] Fetching sessions for coachId:', coachId)

    // Strategy: fetch all sessions, then filter in JS.
    // This avoids Airtable filterByFormula issues with linked records,
    // which is the most common cause of "0 sessions returned" bugs.
    // For MVP scale (under 1000 sessions) this is fast and reliable.
    const allRecords = await sessionsTable
      .select({
        sort: [{ field: 'date_time', direction: 'asc' }],
      })
      .firstPage()

    console.log('[API sessions/list] Total sessions in table:', allRecords.length)

    // Filter for this coach. Linked record fields return as arrays of record IDs.
    const sessions = allRecords
      .filter((record) => {
        const linkedCoachIds = record.get('coach_id')
        console.log('[API sessions/list] Record', record.id, 'coach_id field:', JSON.stringify(linkedCoachIds))

        // Handle different formats Airtable returns for linked records
        if (Array.isArray(linkedCoachIds)) {
          return linkedCoachIds.includes(coachId)
        }
        if (typeof linkedCoachIds === 'string') {
          return linkedCoachIds === coachId
        }
        return false
      })
      .map((record) => ({
        id: record.id,
        sessionName: record.get('session_name') || '',
        sessionType: record.get('session_type'),
        dateTime: record.get('date_time'),
        durationMinutes: record.get('duration_minutes'),
        capacity: record.get('capacity'),
        bookedCount: record.get('booked_count') || 0,
        ageGroup: record.get('age_group'),
        skillLevel: record.get('skill_level'),
        priceCents: record.get('price_cents'),
        injuryNotes: record.get('injury_notes'),
        recurrenceRule: record.get('recurrence_rule') || 'None',
      }))

    console.log('[API sessions/list] Filtered sessions for coach:', sessions.length)

    return NextResponse.json({ sessions })
  } catch (error) {
    console.error('[API sessions/list] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sessions' },
      { status: 500 }
    )
  }
}
