// app/api/coaches/me/route.ts
// PATCH the logged-in coach's own record. Currently only the vertical
// flag, but the shape is open so future per-coach prefs can land here.

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { getAuthFromRequest } from '@/app/lib/auth'

const VALID_VERTICALS = new Set(['sport', 'fitness'])

export async function PATCH(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth || !auth.coachId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body: { vertical?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof body.vertical !== 'string' || !VALID_VERTICALS.has(body.vertical)) {
    return NextResponse.json(
      { error: 'vertical must be "sport" or "fitness"' },
      { status: 400 }
    )
  }

  try {
    const { rows } = await sql`
      UPDATE coaches_v2
      SET vertical = ${body.vertical}, updated_at = NOW()
      WHERE id = ${auth.coachId}
      RETURNING vertical
    `
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Coach not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true, vertical: rows[0].vertical })
  } catch (error) {
    console.error('[COACHES ME PATCH] error:', error)
    return NextResponse.json({ error: 'Failed to update coach' }, { status: 500 })
  }
}
