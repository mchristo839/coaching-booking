// app/api/cron/cleanup/route.ts
// Daily cleanup cron — removes stale processed_messages rows.

import { NextRequest, NextResponse } from 'next/server'
import { cleanupProcessedMessages } from '@/app/lib/db'

function isAuthorised(request: NextRequest): boolean {
  if (request.headers.get('x-vercel-cron')) return true
  const secret = process.env.HEALTH_CHECK_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  try {
    const deleted = await cleanupProcessedMessages()
    console.log(`[CLEANUP] Deleted ${deleted} stale processed_messages rows`)
    return NextResponse.json({ deleted, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('[CLEANUP] Error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
