// app/api/dev/db-host/route.ts
// Diagnostic — returns the hostname/port that POSTGRES_URL is pointing at
// so we can verify env-var changes actually applied. Returns NO credentials,
// just host/port/scheme. Protected by HEALTH_CHECK_SECRET.

import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const secret = process.env.HEALTH_CHECK_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }
  const raw = process.env.POSTGRES_URL || ''
  if (!raw) {
    return NextResponse.json({ error: 'POSTGRES_URL is empty' }, { status: 500 })
  }
  try {
    const u = new URL(raw)
    return NextResponse.json({
      scheme: u.protocol.replace(':', ''),
      host: u.hostname,
      port: u.port || '5432',
      database: u.pathname.replace(/^\//, ''),
      user_present: !!u.username,
      length: raw.length,
    })
  } catch (e) {
    return NextResponse.json({
      error: 'Invalid POSTGRES_URL',
      length: raw.length,
      head: raw.slice(0, 20),
    })
  }
}
