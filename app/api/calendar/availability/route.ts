// app/api/calendar/availability/route.ts
// Manage the logged-in coach's weekly PT availability.
//
//   GET  ?weekCommencing=YYYY-MM-DD → list blocks for that week
//   POST { weekCommencing, blocks: [{day_of_week,start_time,end_time}],
//          durationMin?, pricePerSlotGbp? }
//        → replaces all blocks AND regenerates calendar_slots

import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/app/lib/auth'
import {
  declareAvailability,
  generateSlotsFromAvailability,
  getAvailabilityForWeek,
  type AvailabilityBlock,
} from '@/app/lib/calendar'

// Compute the Monday on/before today (in UTC; good enough for week buckets)
function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) throw new Error('invalid date')
  // getUTCDay: 0=Sunday, 1=Monday … 6=Saturday. Shift to ISO (Mon=0).
  const isoDay = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - isoDay)
  return d.toISOString().slice(0, 10)
}

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth || !auth.coachId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  const wcParam = request.nextUrl.searchParams.get('weekCommencing')
  const wc = wcParam ? mondayOf(wcParam) : mondayOf(new Date().toISOString().slice(0, 10))
  const blocks = await getAvailabilityForWeek(auth.coachId, wc)
  return NextResponse.json({ weekCommencing: wc, blocks })
}

interface BlockInput {
  day_of_week: number
  start_time: string
  end_time: string
}

export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth || !auth.coachId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  let body: {
    weekCommencing?: string
    blocks?: BlockInput[]
    durationMin?: number
    pricePerSlotGbp?: number | null
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const wcRaw = body.weekCommencing || new Date().toISOString().slice(0, 10)
  const wc = mondayOf(wcRaw)
  const blocks: AvailabilityBlock[] = Array.isArray(body.blocks)
    ? body.blocks
        .filter((b) => b && typeof b.day_of_week === 'number' && b.start_time && b.end_time)
        .map((b) => ({
          day_of_week: b.day_of_week,
          start_time: b.start_time,
          end_time: b.end_time,
        }))
    : []
  const durationMin = Math.max(15, Math.min(180, Number(body.durationMin || 60)))
  const pricePerSlotGbp =
    body.pricePerSlotGbp != null && !Number.isNaN(Number(body.pricePerSlotGbp))
      ? Number(body.pricePerSlotGbp)
      : null

  try {
    await declareAvailability(auth.coachId, wc, blocks)
    const slotResult = await generateSlotsFromAvailability(
      auth.coachId,
      wc,
      durationMin,
      pricePerSlotGbp
    )
    return NextResponse.json({
      ok: true,
      weekCommencing: wc,
      blocksSaved: blocks.length,
      slotsGenerated: slotResult.generated,
      slotsSkippedDuplicate: slotResult.skipped,
    })
  } catch (error) {
    console.error('[CALENDAR availability POST] error:', error)
    return NextResponse.json({ error: 'Failed to save availability' }, { status: 500 })
  }
}
