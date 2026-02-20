// app/api/sessions/detail/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { sessionsTable, bookingsTable } from '@/app/lib/airtable'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      )
    }

    // Get the session record
    const sessionRecord = await sessionsTable.find(sessionId)

    const session = {
      id: sessionRecord.id,
      sessionName: sessionRecord.get('session_name') || '',
      sessionType: sessionRecord.get('session_type'),
      dateTime: sessionRecord.get('date_time'),
      durationMinutes: sessionRecord.get('duration_minutes'),
      capacity: sessionRecord.get('capacity'),
      bookedCount: sessionRecord.get('booked_count') || 0,
      ageGroup: sessionRecord.get('age_group'),
      skillLevel: sessionRecord.get('skill_level'),
      priceCents: sessionRecord.get('price_cents'),
      injuryNotes: sessionRecord.get('injury_notes'),
      recurrenceRule: sessionRecord.get('recurrence_rule') || 'None',
    }

    // Get all bookings linked to this session (JS-side filtering)
    const allBookings = await bookingsTable.select().firstPage()
    const bookings = allBookings
      .filter((record) => {
        const linked = record.get('session_id')
        if (Array.isArray(linked)) return linked.includes(sessionId)
        if (typeof linked === 'string') return linked === sessionId
        return false
      })
      .map((record) => ({
        id: record.id,
        userName: record.get('user_name'),
        userEmail: record.get('user_email'),
        userPhone: record.get('user_phone') || '',
        medicalInfo: record.get('medical_info') || '',
        paymentMethod: record.get('payment_method') || 'stripe',
        paymentStatus: record.get('payment_status') || 'pending',
        attendanceStatus: record.get('attendance_status') || 'registered',
        createdAt: record.get('created_at'),
      }))

    return NextResponse.json({ session, bookings })
  } catch (error) {
    console.error('[API sessions/detail] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch session details' },
      { status: 500 }
    )
  }
}
