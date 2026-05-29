// app/api/onboarding/start/route.ts
// Coach-triggered. Kicks off Flow 0 onboarding for a given member.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/app/lib/auth'
import { sql } from '@/app/lib/sql'
import { startOnboarding, findMemberById, type OnboardingTrack } from '@/app/lib/onboarding'

export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth || !auth.coachId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body: { memberId?: string; track?: OnboardingTrack } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const memberId = body.memberId
  const track: OnboardingTrack = body.track === 'class' ? 'class' : 'pt'
  if (!memberId) {
    return NextResponse.json({ error: 'memberId required' }, { status: 400 })
  }

  const member = await findMemberById(memberId)
  if (!member) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  }

  // Verify caller has authority over this member's programme
  const { rows: progRows } = await sql`
    SELECT coach_id FROM programmes WHERE id = ${member.programme_id} LIMIT 1
  `
  if (!progRows[0] || progRows[0].coach_id !== auth.coachId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Resolve a JID
  const jid =
    member.parent_whatsapp_id ||
    (member.parent_phone
      ? `${member.parent_phone.replace(/\D/g, '')}@s.whatsapp.net`
      : null)
  if (!jid) {
    return NextResponse.json(
      { error: 'Member has no WhatsApp identity (phone/whatsapp_id missing)' },
      { status: 400 }
    )
  }

  const result = await startOnboarding(memberId, jid, auth.coachId, track)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }
  return NextResponse.json({ ok: true, stateId: result.state_id, jid, track })
}
