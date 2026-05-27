// app/api/cron/release-pt-holds/route.ts
// Cron: release calendar_slots whose 15-minute hold has expired without
// being booked. Idempotent. Bearer-protected by HEALTH_CHECK_SECRET so
// the same Contabo cron secret unlocks it.

import { NextRequest, NextResponse } from 'next/server'
import { releaseExpiredHolds } from '@/app/lib/calendar'

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
    const released = await releaseExpiredHolds()
    return NextResponse.json({
      ok: true,
      released,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[CRON release-pt-holds] error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// GET variant for ad-hoc curl checks (same auth)
export async function GET(request: NextRequest) {
  return POST(request)
}
