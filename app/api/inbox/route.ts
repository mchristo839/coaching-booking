// app/api/inbox/route.ts
// Inbox dashboard data: today's stats + recent entries for the logged-in coach.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/app/lib/auth'
import { getInboxStats, listRecentInboxEntries } from '@/app/lib/inbox-agent'

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth || !auth.coachId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  const [stats, entries] = await Promise.all([
    getInboxStats(auth.coachId),
    listRecentInboxEntries(auth.coachId, 50),
  ])
  return NextResponse.json({ stats, entries })
}
