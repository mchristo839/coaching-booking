// app/api/sessions/detail/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { findSession, listBookingsBySession } from '@/app/lib/db'

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

    const row = await findSession(sessionId)
    if (!row) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      )
    }

    const session = {
      id: row.id,
      sessionName: row.session_name || '',
      sessionType: row.session_type,
      dateTime: row.date_time,
      durationMinutes: row.duration_minutes,
      capacity: row.capacity,
      bookedCount: Number(row.booked_count) || 0,
      ageGroup: row.age_group,
      skillLevel: row.skill_level,
      priceCents: row.price_cents,
      injuryNotes: row.injury_notes,
      recurrenceRule: row.recurrence_rule || 'None',
    }

    const bookingRows = await listBookingsBySession(sessionId)
    const bookings = bookingRows.map((r) => ({
      id: r.id,
      userName: r.user_name,
      userEmail: r.user_email,
      userPhone: r.user_phone || '',
      medicalInfo: r.medical_info || '',
      paymentMethod: r.payment_method || 'stripe',
      paymentStatus: r.payment_status || 'pending',
      attendanceStatus: r.attendance_status || 'registered',
      createdAt: r.created_at,
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
