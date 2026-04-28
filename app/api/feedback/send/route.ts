// app/api/feedback/send/route.ts
// Studio manager fires a post-session feedback request to a single client.
// Creates a pending_feedback row, generates the AI prompt, and sends via
// WhatsApp 1:1.
//
// Auth: any logged-in coach who owns the programme.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/app/lib/auth'
import { sql } from '@vercel/postgres'
import {
  normalizeUkPhoneToJid,
  createPendingFeedback,
  findActiveReferSlugForProgramme,
} from '@/app/lib/feedback'
import { generateFeedbackPrompt } from '@/app/lib/ai-messages'
import { sendWhatsAppMessage } from '@/app/lib/evolution'

export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth || !auth.coachId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body: {
    programmeId?: string
    clientName?: string
    clientPhone?: string
    ptName?: string
    sessionDate?: string  // YYYY-MM-DD; optional
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.programmeId || !body.clientName?.trim() || !body.clientPhone?.trim()) {
    return NextResponse.json(
      { error: 'programmeId, clientName, and clientPhone are required' },
      { status: 400 }
    )
  }

  // Ownership check — programme.coach_id must match the logged-in coach.
  // (No role-up to GMs/admins here yet — fitness vertical is single-coach
  // for the demo.)
  const { rows: progRows } = await sql`
    SELECT id, programme_name, coach_id
    FROM programmes
    WHERE id = ${body.programmeId} AND coach_id = ${auth.coachId} AND is_active = true
    LIMIT 1
  `
  if (progRows.length === 0) {
    return NextResponse.json({ error: 'Programme not found or not yours' }, { status: 404 })
  }
  const programme = progRows[0]

  const clientJid = normalizeUkPhoneToJid(body.clientPhone)
  const clientName = body.clientName.trim()
  const firstName = clientName.split(/\s+/)[0]

  try {
    // Find an active refer-a-friend slug so the high-score path can hand
    // out a ready-made link without bothering the manager. Null is fine.
    const referSlug = await findActiveReferSlugForProgramme(programme.id)

    const pendingId = await createPendingFeedback({
      programmeId: programme.id,
      clientJid,
      clientName,
      ptName: body.ptName || null,
      sessionDate: body.sessionDate || null,
      referSlug,
    })

    const prompt = await generateFeedbackPrompt({
      clientFirstName: firstName,
      programmeName: programme.programme_name,
      ptName: body.ptName || null,
      sessionDate: body.sessionDate || null,
    })

    // sendWhatsAppMessage builds a 1:1 chat with the client. JID format
    // already includes @s.whatsapp.net.
    await sendWhatsAppMessage(clientJid, prompt)

    return NextResponse.json({
      success: true,
      pendingId,
      clientJid,
      preview: prompt,
    })
  } catch (error) {
    console.error('[FEEDBACK SEND] error:', error)
    return NextResponse.json(
      { error: 'Failed to send feedback request', detail: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
