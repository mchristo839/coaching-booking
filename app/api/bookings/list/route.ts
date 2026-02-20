// app/api/bookings/list/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { sessionsTable, bookingsTable } from '@/app/lib/airtable'

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

    console.log('[API bookings/list] Fetching bookings for coachId:', coachId)

    // Get all sessions for this coach (JS-side filter for linked records)
    const allSessions = await sessionsTable.select().firstPage()
    const coachSessionIds = allSessions
      .filter((record) => {
        const linked = record.get('coach_id')
        if (Array.isArray(linked)) return linked.includes(coachId)
        if (typeof linked === 'string') return linked === coachId
        return false
      })
      .map((r) => r.id)

    console.log('[API bookings/list] Coach session IDs:', coachSessionIds)

    if (coachSessionIds.length === 0) {
      return NextResponse.json({ bookings: [] })
    }

    // Get all bookings and filter by coach's session IDs
    const allBookings = await bookingsTable
      .select({
        sort: [{ field: 'created_at', direction: 'desc' }],
      })
      .firstPage()

    const bookings = allBookings
      .filter((record) => {
        const linkedSessionIds = record.get('session_id')
        if (Array.isArray(linkedSessionIds)) {
          return linkedSessionIds.some((sid: string) => coachSessionIds.includes(sid))
        }
        if (typeof linkedSessionIds === 'string') {
          return coachSessionIds.includes(linkedSessionIds)
        }
        return false
      })
      .map((record) => ({
        id: record.id,
        sessionId: record.get('session_id'),
        userName: record.get('user_name'),
        userEmail: record.get('user_email'),
        userPhone: record.get('user_phone'),
        medicalInfo: record.get('medical_info'),
        consentGiven: record.get('consent_given'),
        paymentStatus: record.get('payment_status'),
        createdAt: record.get('created_at'),
      }))

    console.log('[API bookings/list] Bookings found:', bookings.length)

    return NextResponse.json({ bookings })
  } catch (error) {
    console.error('[API bookings/list] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch bookings' },
      { status: 500 }
    )
  }
}
