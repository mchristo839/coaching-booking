// app/api/coaches/me/route.ts
// PATCH the logged-in coach's own record — vertical and WhatsApp bot
// live/paused status, with the shape open for future per-coach prefs.

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/app/lib/sql'
import { getAuthFromRequest } from '@/app/lib/auth'

const VALID_VERTICALS = new Set(['sport', 'fitness'])
const VALID_BOT_STATUSES = new Set(['live', 'paused'])

export async function PATCH(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth || !auth.coachId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body: { vertical?: string; whatsappBotStatus?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (body.vertical === undefined && body.whatsappBotStatus === undefined) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  if (body.vertical !== undefined && !VALID_VERTICALS.has(body.vertical)) {
    return NextResponse.json(
      { error: 'vertical must be "sport" or "fitness"' },
      { status: 400 }
    )
  }

  if (body.whatsappBotStatus !== undefined && !VALID_BOT_STATUSES.has(body.whatsappBotStatus)) {
    return NextResponse.json(
      { error: 'whatsappBotStatus must be "live" or "paused"' },
      { status: 400 }
    )
  }

  try {
    const { rows } = await sql`
      UPDATE coaches_v2
      SET
        vertical = COALESCE(${body.vertical ?? null}, vertical),
        whatsapp_bot_status = COALESCE(${body.whatsappBotStatus ?? null}, whatsapp_bot_status),
        updated_at = NOW()
      WHERE id = ${auth.coachId}
      RETURNING vertical, whatsapp_bot_status
    `
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Coach not found' }, { status: 404 })
    }
    return NextResponse.json({
      success: true,
      vertical: rows[0].vertical,
      whatsappBotStatus: rows[0].whatsapp_bot_status,
    })
  } catch (error) {
    console.error('[COACHES ME PATCH] error:', error)
    return NextResponse.json({ error: 'Failed to update coach' }, { status: 500 })
  }
}
