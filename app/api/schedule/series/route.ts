// app/api/schedule/series/route.ts
// Create a recurring training/fixture series.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/app/lib/auth'
import { requireAuthorityOver, PermissionError } from '@/app/lib/permissions'
import { createSeries, listSeriesForProgramme } from '@/app/lib/control-centre-db'

export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth || !auth.coachId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const {
      programmeId, seriesType, title, recurrenceRule,
      seriesStart, seriesEnd, defaultTime, defaultDurationMins, defaultVenue,
    } = body

    if (!programmeId || !seriesType || !recurrenceRule || !seriesStart || !defaultTime) {
      return NextResponse.json(
        { error: 'programmeId, seriesType, recurrenceRule, seriesStart, defaultTime are required' },
        { status: 400 }
      )
    }

    await requireAuthorityOver(auth.coachId, [programmeId])

    const series = await createSeries({
      programmeId,
      seriesType,
      title: title || null,
      recurrenceRule,
      seriesStart,
      seriesEnd: seriesEnd || null,
      defaultTime,
      defaultDurationMins: defaultDurationMins || 60,
      defaultVenue: defaultVenue || null,
    })

    return NextResponse.json({ series })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('[SCHEDULE SERIES POST] error:', error)
    return NextResponse.json({ error: 'Failed to create series' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth || !auth.coachId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  const programmeId = request.nextUrl.searchParams.get('programme_id')
  if (!programmeId) {
    return NextResponse.json({ error: 'programme_id required' }, { status: 400 })
  }
  try {
    await requireAuthorityOver(auth.coachId, [programmeId])
    const series = await listSeriesForProgramme(programmeId)
    return NextResponse.json({ series })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('[SCHEDULE SERIES GET] error:', error)
    return NextResponse.json({ error: 'Failed to load series' }, { status: 500 })
  }
}
