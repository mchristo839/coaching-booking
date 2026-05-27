// app/api/cron/post-trial-conversion/route.ts
// Daily cron: progress Flow 9 post-trial conversion ladder.

import { NextRequest, NextResponse } from 'next/server'
import { runPostTrialConversion } from '@/app/lib/post-trial-conversion'

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
    const result = await runPostTrialConversion()
    return NextResponse.json({ ok: true, ...result, timestamp: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
export async function GET(request: NextRequest) { return POST(request) }
