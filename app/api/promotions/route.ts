// app/api/promotions/route.ts
// POST: Create a promotion draft and generate the AI message.
// GET: List promotions created by the current coach.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/app/lib/auth'
import { getAuthorisedProgrammes, requireAuthorityOver, PermissionError } from '@/app/lib/permissions'
import { createPromotion, listPromotionsForCoach } from '@/app/lib/control-centre-db'
import { generatePromotionMessage } from '@/app/lib/ai-messages'
import { getPublicAppUrl } from '@/app/lib/urls'
import { sql } from '@/app/lib/sql'
import { randomBytes } from 'crypto'

// Unguessable, URL-safe referral slug.
// 32-char alphabet (no look-alike l/o) → exactly 5 bits per char, so masking
// each random byte with & 31 introduces no modulo bias. 16 chars ≈ 80 bits of
// entropy from a CSPRNG — not enumerable, and deliberately carries no client
// name or other identifying info (that would make links guessable and leak who
// the link belongs to).
function randomSlug(len = 16): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'
  const bytes = randomBytes(len)
  let out = ''
  for (let i = 0; i < len; i++) out += chars[bytes[i] & 31]
  return out
}

export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth || !auth.coachId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const {
      promotionType, title, detail, startAt, endAt, venue,
      costGbp, isFree, paymentLink, sendMode, programmeIds,
      campDays,
    } = body

    if (!promotionType || !detail) {
      return NextResponse.json(
        { error: 'promotionType and detail are required' },
        { status: 400 }
      )
    }

    // Camp-specific validation.
    let cleanCampDays: { date: string; label: string; price_gbp: number; capacity: number | null }[] | null = null
    if (promotionType === 'holiday_camp') {
      if (!Array.isArray(campDays) || campDays.length === 0) {
        return NextResponse.json(
          { error: 'Holiday camp promotions need at least one day in campDays' },
          { status: 400 }
        )
      }
      if (!paymentLink) {
        return NextResponse.json(
          { error: 'Holiday camp promotions need a paymentLink' },
          { status: 400 }
        )
      }
      cleanCampDays = campDays
        .filter((d: { date?: string; price_gbp?: number }) => d && d.date && typeof d.price_gbp === 'number')
        .map((d: { date: string; label?: string; price_gbp: number; capacity?: number | null }) => ({
          date: d.date,
          label: d.label || d.date,
          price_gbp: Number(d.price_gbp),
          capacity: d.capacity != null ? Number(d.capacity) : null,
        }))
      if (cleanCampDays.length === 0) {
        return NextResponse.json(
          { error: 'No valid camp days provided' },
          { status: 400 }
        )
      }
    }

    // Resolve programme IDs — if "all_groups", use the coach's authorised programmes
    let resolvedProgrammeIds: string[] = []
    const authorisedProgrammes = await getAuthorisedProgrammes(auth.coachId)

    if (sendMode === 'all_groups') {
      resolvedProgrammeIds = authorisedProgrammes.map((p) => p.programme_id)
    } else {
      resolvedProgrammeIds = Array.isArray(programmeIds) ? programmeIds : []
      await requireAuthorityOver(auth.coachId, resolvedProgrammeIds)
    }

    if (resolvedProgrammeIds.length === 0) {
      return NextResponse.json(
        { error: 'No target programmes resolved' },
        { status: 400 }
      )
    }

    // Use the first programme's name + coach name for AI prompt context
    const firstProg = authorisedProgrammes.find((p) =>
      resolvedProgrammeIds.includes(p.programme_id)
    )

    const { rows: coachRows } = await sql`
      SELECT first_name, last_name FROM coaches_v2 WHERE id = ${auth.coachId} LIMIT 1
    `
    const coachName = coachRows[0]
      ? `${coachRows[0].first_name} ${coachRows[0].last_name}`.trim()
      : 'Coach'

    const slug = randomSlug()

    let generatedMessage = ''
    try {
      generatedMessage = await generatePromotionMessage({
        promotionType,
        title: title || null,
        detail,
        startAt: startAt || null,
        endAt: endAt || null,
        venue: venue || null,
        costGbp: typeof costGbp === 'number' ? costGbp : null,
        isFree: !!isFree,
        paymentLink: paymentLink || null,
        coachName,
        programmeName: firstProg?.programme_name || 'the programme',
        referralLink:
          promotionType === 'refer_a_friend'
            ? `${getPublicAppUrl()}/refer/${slug}`
            : null,
      })
    } catch (e) {
      console.error('[PROMOTIONS] AI generation failed:', e)
      generatedMessage = `${title || 'Update from ' + coachName}:\n\n${detail}`
    }

    const promotion = await createPromotion({
      createdBy: auth.coachId,
      promotionType,
      title: title || null,
      detail,
      startAt: startAt || null,
      endAt: endAt || null,
      venue: venue || null,
      costGbp: typeof costGbp === 'number' ? costGbp : null,
      isFree: !!isFree,
      paymentLink: paymentLink || null,
      sendMode: sendMode || 'selected_groups',
      generatedMessage,
      slug,
      programmeIds: resolvedProgrammeIds,
      campDays: cleanCampDays,
    })

    return NextResponse.json({ promotion })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('[PROMOTIONS POST] error:', error)
    return NextResponse.json({ error: 'Failed to create promotion' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth || !auth.coachId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const promotions = await listPromotionsForCoach(auth.coachId)
    return NextResponse.json({ promotions })
  } catch (error) {
    console.error('[PROMOTIONS GET] error:', error)
    return NextResponse.json({ error: 'Failed to list promotions' }, { status: 500 })
  }
}
