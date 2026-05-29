// app/api/cron/onboarding-nudge/route.ts
// Daily cron: nudge stalled onboarding sessions at T+24h, mark abandoned at T+7d.

import { NextRequest, NextResponse } from 'next/server'
import { nudgeStalledOnboarding } from '@/app/lib/onboarding'

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
    const result = await nudgeStalledOnboarding()
    return NextResponse.json({ ok: true, ...result, timestamp: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
