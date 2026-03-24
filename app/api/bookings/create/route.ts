// app/api/bookings/create/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createBooking } from '@/app/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, userName, userEmail, userPhone, medicalInfo, consentGiven, paymentMethod } = body

    if (!sessionId || !userName || !userEmail || !consentGiven) {
      return NextResponse.json(
        { error: 'Session, name, email, and consent are required' },
        { status: 400 }
      )
    }

    const method = paymentMethod || 'stripe'
    const paymentStatus = method === 'cash' ? 'completed' : 'pending'

    const booking = await createBooking({
      session_id: sessionId,
      user_name: userName,
      user_email: userEmail,
      user_phone: userPhone || '',
      medical_info: medicalInfo || '',
      consent_given: true,
      payment_status: paymentStatus,
      payment_method: method,
      attendance_status: 'registered',
    })

    return NextResponse.json({
      success: true,
      bookingId: booking.id,
      paymentMethod: method,
      paymentStatus,
    })
  } catch (error) {
    console.error('Create booking error:', error)
    return NextResponse.json(
      { error: 'Failed to create booking. Please try again.' },
      { status: 500 }
    )
  }
}
