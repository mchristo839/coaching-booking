// app/api/health/route.ts
// Health check endpoint — protected by HEALTH_CHECK_SECRET bearer token.

import { NextRequest, NextResponse } from 'next/server'
import { runHealthChecks } from '@/app/lib/health-checks'

function isAuthorised(request: NextRequest): boolean {
  const secret = process.env.HEALTH_CHECK_SECRET
  if (!secret) return false
  const auth = request.headers.get('authorization')
  return auth === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  try {
    const result = await runHealthChecks()
    return NextResponse.json(result)
  } catch (error) {
    console.error('[HEALTH] Unexpected error:', error)
    return NextResponse.json(
      { status: 'down', error: String(error), timestamp: new Date().toISOString() },
      { status: 500 }
    )
  }
}
