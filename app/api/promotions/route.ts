// app/api/promotions/route.ts
// POST: Create a promotion draft and generate the AI message.
// GET: List promotions created by the current coach.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/app/lib/auth'
import { getAuthorisedProgrammes, requireAuthorityOver, PermissionError } from '@/app/lib/permissions'
import { createPromotion, listPromotionsForCoach } from '@/app/lib/control-centre-db'
import { generatePromotionMessage } from '@/app/lib/ai-messages'
import { sql } from '@vercel/postgres'

function randomSlug(len = 8): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)]
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
    } = body

    if (!promotionType || !detail) {
      return NextResponse.json(
        { error: 'promotionType and detail are required' },
        { status: 400 }
      )
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
            ? `${process.env.NEXT_PUBLIC_APP_URL || 'https://coaching-booking-v3.vercel.app'}/refer/${slug}`
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
