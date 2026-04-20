// app/api/auth/me/route.ts
// Returns the current user's identity + basic profile.
// 401 if not authenticated.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/app/lib/auth'
import { sql } from '@vercel/postgres'

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { rows } = await sql`
      SELECT p.id as provider_id, p.email, p.first_name, p.last_name, p.trading_name,
             c.id as coach_id, c.first_name as coach_first_name, c.last_name as coach_last_name
      FROM providers p
      LEFT JOIN coaches_v2 c ON c.id = ${auth.coachId}
      WHERE p.id = ${auth.providerId}
      LIMIT 1
    `
    const user = rows[0]
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({
      providerId: user.provider_id,
      coachId: user.coach_id || null,
      email: user.email,
      name: `${user.first_name} ${user.last_name}`.trim(),
      tradingName: user.trading_name,
    })
  } catch (error) {
    console.error('[AUTH-ME] error:', error)
    return NextResponse.json({ error: 'Failed to load user' }, { status: 500 })
  }
}
