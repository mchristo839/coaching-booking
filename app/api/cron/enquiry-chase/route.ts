// app/api/cron/enquiry-chase/route.ts
// Daily cron: progress the Flow 4 new-enquiry chase ladder.
// Bearer-protected by HEALTH_CHECK_SECRET.

import { NextRequest, NextResponse } from 'next/server'
import { runEnquiryChaseLadder } from '@/app/lib/enquiry-chase'

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
    const result = await runEnquiryChaseLadder()
    return NextResponse.json({ ok: true, ...result, timestamp: new Date().toISOString() })
  } catch (e) {
    console.error('[CRON enquiry-chase] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function GET(request: NextRequest) { return POST(request) }
