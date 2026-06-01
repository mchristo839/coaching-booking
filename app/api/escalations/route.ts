// app/api/escalations/route.ts
// GET  — list the logged-in coach's outstanding (unacknowledged) escalations.
// POST — acknowledge escalations: { ids: string[] } for specific ones, or
//        { all: true } to clear them all. Acking sets escalation_acked_at,
//        which is what the ops health check reads — so this clears the
//        "unacked escalation(s)" warning alert.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/app/lib/auth'
import { listUnackedEscalations, ackEscalations } from '@/app/lib/db'

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth || !auth.coachId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  const escalations = await listUnackedEscalations(auth.coachId)
  return NextResponse.json({ escalations })
}

export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth || !auth.coachId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const all = body?.all === true
  const ids: string[] | undefined = Array.isArray(body?.ids)
    ? body.ids.filter((x: unknown): x is string => typeof x === 'string')
    : undefined

  if (!all && (!ids || ids.length === 0)) {
    return NextResponse.json(
      { error: 'Provide ids[] to acknowledge, or { all: true }' },
      { status: 400 }
    )
  }

  const acked = await ackEscalations(auth.coachId, all ? undefined : ids)
  return NextResponse.json({ ok: true, acked })
}
