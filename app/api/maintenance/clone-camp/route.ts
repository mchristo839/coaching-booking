// app/api/maintenance/clone-camp/route.ts
// One-shot ops helper: clone an existing holiday-camp promotion into a new one
// with different dates (e.g. create the August camp from the July one). Copies
// price/capacity/payment-link/venue/detail; only the days + title change.
// Bearer-token guarded. Defaults to a DRY RUN.

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/app/lib/sql'
import { createPromotion, getPromotion, getPromotionTargets, type CampDayInput } from '@/app/lib/control-centre-db'

function isAuthorised(request: NextRequest): boolean {
  const secret = process.env.HEALTH_CHECK_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function dayLabel(isoDate: string): string {
  const dt = new Date(`${isoDate}T12:00:00Z`)
  return `${WD[dt.getUTCDay()]} ${dt.getUTCDate()} ${MO[dt.getUTCMonth()]}`
}

export async function POST(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const sourcePromotionId = typeof body.sourcePromotionId === 'string' ? body.sourcePromotionId : null
  const title = typeof body.title === 'string' ? body.title : null
  const dates = Array.isArray(body.dates) ? (body.dates as string[]) : null
  const programmeIdsOverride = Array.isArray(body.programmeIds) ? (body.programmeIds as string[]) : null
  const dryRun = body.dryRun !== false // default: dry run

  if (!sourcePromotionId || !dates || dates.length === 0 || !title) {
    return NextResponse.json(
      { error: 'Required: sourcePromotionId, title, dates[] (YYYY-MM-DD).' },
      { status: 400 }
    )
  }
  // Validate date format up front so we never build a broken camp.
  for (const d of dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(new Date(`${d}T12:00:00Z`).getTime())) {
      return NextResponse.json({ error: `Bad date: ${d} (expected YYYY-MM-DD)` }, { status: 400 })
    }
  }

  const src = await getPromotion(sourcePromotionId)
  if (!src) {
    return NextResponse.json({ error: `Source promotion ${sourcePromotionId} not found` }, { status: 404 })
  }
  const srcDays: Array<{ price_gbp?: number; capacity?: number | null }> = Array.isArray(src.camp_days)
    ? src.camp_days
    : []

  // New days reuse the source's per-day price + capacity (mapped by index; the
  // last source day repeats if the new camp has more days).
  const newDays: CampDayInput[] = dates.map((d, i) => {
    const ref = srcDays[Math.min(i, Math.max(srcDays.length - 1, 0))] || {}
    return {
      date: d,
      label: dayLabel(d),
      price_gbp: Number(ref.price_gbp || 0),
      capacity: ref.capacity ?? null,
    }
  })

  const targets = await getPromotionTargets(sourcePromotionId)
  const programmeIds = programmeIdsOverride || targets.map((t) => t.programme_id as string)

  const preview = {
    sourcePromotionId,
    title,
    payment_link: src.payment_link,
    venue: src.venue,
    detail: src.detail,
    programmeIds,
    days: newDays,
  }

  if (dryRun) {
    return NextResponse.json({ dryRun: true, willCreate: preview })
  }

  const promo = await createPromotion({
    createdBy: src.created_by as string,
    promotionType: 'holiday_camp',
    title,
    detail: (src.detail as string) || title,
    venue: (src.venue as string) ?? null,
    costGbp: (src.cost_gbp as number) ?? null,
    isFree: false,
    paymentLink: (src.payment_link as string) ?? null,
    sendMode: (src.send_mode as 'all_groups' | 'selected_groups') || 'selected_groups',
    generatedMessage: (src.generated_message as string) ?? null,
    programmeIds,
    campDays: newDays,
    campImageUrl: (src.camp_image_url as string) ?? null,
  })
  // Make it live (createPromotion leaves status at its default).
  await sql`UPDATE promotions SET status = 'sent' WHERE id = ${promo.id}`

  return NextResponse.json({ dryRun: false, created: { id: promo.id, ...preview } })
}
