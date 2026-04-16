// app/api/maintenance/cleanup/route.ts
// Daily cleanup — removes stale processed_messages rows.
// Called from Contabo cron via POST with bearer token.

import { NextRequest, NextResponse } from 'next/server'
import { cleanupProcessedMessages } from '@/app/lib/db'

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
    const deleted = await cleanupProcessedMessages()
    console.log(`[CLEANUP] Deleted ${deleted} stale processed_messages rows`)
    return NextResponse.json({ deleted, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('[CLEANUP] Error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
