// app/api/cron/membership-renewal/route.ts
// Daily cron (Contabo): fire Flow 11 membership renewal reminders.
// Bearer-protected by HEALTH_CHECK_SECRET.

import { NextRequest, NextResponse } from 'next/server'
import { runMembershipRenewalReminders } from '@/app/lib/lifecycle-crons'

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
    const result = await runMembershipRenewalReminders()
    return NextResponse.json({ ok: true, ...result, timestamp: new Date().toISOString() })
  } catch (e) {
    console.error('[CRON renewal] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function GET(request: NextRequest) { return POST(request) }
