// app/api/bookings/list/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { listBookingsByCoach } from '@/app/lib/db'

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

    const rows = await listBookingsByCoach(coachId)

    const bookings = rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      userName: r.user_name,
      userEmail: r.user_email,
      userPhone: r.user_phone,
      medicalInfo: r.medical_info,
      consentGiven: r.consent_given,
      paymentStatus: r.payment_status,
      createdAt: r.created_at,
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
