// app/api/checkout/route.ts
import { NextRequest, NextResponse } from 'next/server'
import stripe from '@/app/lib/stripe'

export async function POST(request: NextRequest) {
  try {
    const { bookingId, sessionId, email, amount, sessionDescription } = await request.json()

    if (!bookingId || !email || !amount) {
      return NextResponse.json(
        { error: 'Booking ID, email, and amount are required' },
        { status: 400 }
      )
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'

    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            product_data: {
              name: sessionDescription || 'Coaching Session',
            },
            unit_amount: Number(amount), // Already in cents/pence
          },
          quantity: 1,
        },
      ],
      metadata: {
        bookingId,
        sessionId: sessionId || '',
      },
      success_url: `${appUrl}/success?booking_id=${bookingId}`,
      cancel_url: `${appUrl}/cancelled`,
    })

    return NextResponse.json({
      sessionId: checkoutSession.id,
      url: checkoutSession.url,
    })
  } catch (error) {
    console.error('Checkout error:', error)
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
