// app/api/webhooks/stripe/route.ts
import { NextRequest, NextResponse } from 'next/server'
import stripe from '@/app/lib/stripe'
import { updateBookingPayment } from '@/app/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing stripe-signature header' },
        { status: 400 }
      )
    }

    let event

    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!
      )
    } catch (err) {
      console.error('Webhook signature verification failed:', err)
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      )
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as { metadata?: { bookingId?: string }; payment_intent?: string }
      const bookingId = session.metadata?.bookingId

      if (bookingId) {
        await updateBookingPayment(
          bookingId,
          'completed',
          (session.payment_intent as string) || ''
        )
        console.log(`Booking ${bookingId} marked as completed`)
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}
