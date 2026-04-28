// app/api/promotions/[id]/route.ts
// PATCH the generated_message of a draft promotion. Lets the coach edit
// the AI-written message before sending.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/app/lib/auth'
import { getPromotion, updatePromotionMessage } from '@/app/lib/control-centre-db'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthFromRequest(request)
  if (!auth || !auth.coachId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body: { generated_message?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const message = typeof body.generated_message === 'string' ? body.generated_message : null
  if (message === null || message.trim().length === 0) {
    return NextResponse.json({ error: 'generated_message is required' }, { status: 400 })
  }

  try {
    const promotion = await getPromotion(params.id)
    if (!promotion) {
      return NextResponse.json({ error: 'Promotion not found' }, { status: 404 })
    }
    if (promotion.created_by !== auth.coachId) {
      return NextResponse.json({ error: 'Not the creator' }, { status: 403 })
    }
    if (promotion.status !== 'draft') {
      return NextResponse.json(
        { error: 'Cannot edit — promotion already sent' },
        { status: 400 }
      )
    }

    await updatePromotionMessage(params.id, message)
    return NextResponse.json({ success: true, generated_message: message })
  } catch (error) {
    console.error('[PROMOTIONS PATCH] error:', error)
    return NextResponse.json({ error: 'Failed to update message' }, { status: 500 })
  }
}
