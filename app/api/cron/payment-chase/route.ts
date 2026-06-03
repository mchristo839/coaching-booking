// app/api/cron/payment-chase/route.ts
// Daily cron: fire Flow 7 payment-chase ladder for pt_sessions with
// payment_status='pending' past their session_date.

import { NextRequest, NextResponse } from 'next/server'
import { runPaymentChase } from '@/app/lib/payment-chase'
import { runCampChase } from '@/app/lib/camp-booking'

function isAuthorised(request: NextRequest): boolean {
  const secret = process.env.HEALTH_CHECK_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function POST(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }
  try {
    const result = await runPaymentChase()
    const camp = await runCampChase()
    return NextResponse.json({ ok: true, ...result, camp, timestamp: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
export async function GET(request: NextRequest) { return POST(request) }
