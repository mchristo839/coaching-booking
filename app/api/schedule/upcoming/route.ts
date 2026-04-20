// app/api/schedule/upcoming/route.ts
// Materialise upcoming instances for a programme over N weeks.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/app/lib/auth'
import { requireAuthorityOver, PermissionError } from '@/app/lib/permissions'
import { listSeriesForProgramme } from '@/app/lib/control-centre-db'
import { expandSeries, type ScheduleInstance } from '@/app/lib/schedule'

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth || !auth.coachId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  const programmeId = request.nextUrl.searchParams.get('programme_id')
  const weeks = parseInt(request.nextUrl.searchParams.get('weeks') || '4', 10)

  if (!programmeId) {
    return NextResponse.json({ error: 'programme_id required' }, { status: 400 })
  }

  try {
    await requireAuthorityOver(auth.coachId, [programmeId])
    const seriesList = await listSeriesForProgramme(programmeId)

    const from = new Date()
    const to = new Date(Date.now() + weeks * 7 * 24 * 60 * 60 * 1000)

    const instances: ScheduleInstance[] = []
    for (const series of seriesList) {
      const expanded = await expandSeries(series as never, from, to)
      instances.push(...expanded)
    }
    instances.sort((a, b) => a.starts_at.localeCompare(b.starts_at))

    return NextResponse.json({ instances })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('[SCHEDULE UPCOMING] error:', error)
    return NextResponse.json({ error: 'Failed to load upcoming' }, { status: 500 })
  }
}
