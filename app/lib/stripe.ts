// app/lib/stripe.ts
// SERVER-SIDE ONLY: Used by API routes for Stripe operations.

import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
})

export default stripe
