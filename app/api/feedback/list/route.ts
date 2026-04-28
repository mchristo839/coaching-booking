// app/api/feedback/list/route.ts
// Manager dashboard data: recent feedback responses + outstanding pending
// requests for the logged-in coach's programmes.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/app/lib/auth'
import { listRecentFeedbackForCoach } from '@/app/lib/feedback'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth || !auth.coachId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  try {
    const data = await listRecentFeedbackForCoach(auth.coachId)
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[FEEDBACK LIST] error:', error)
    return NextResponse.json({ error: 'Failed to load feedback' }, { status: 500 })
  }
}
