// app/api/calendar/sessions/route.ts
// Read-only listing of pt_sessions for the logged-in coach.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/app/lib/auth'
import { listSessionsForCoach } from '@/app/lib/calendar'

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth || !auth.coachId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  const sessions = await listSessionsForCoach(auth.coachId, 100)
  return NextResponse.json({ sessions })
}
