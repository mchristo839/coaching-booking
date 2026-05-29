// app/api/promotions/[id]/members/route.ts
// GET: list the members we can DM a referral link to, across the promotion's
// target programmes. Deduped by JID so the same person (who may be a member of
// more than one targeted programme) only appears once.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/app/lib/auth'
import {
  getPromotion,
  getPromotionTargets,
  listMessageableMembersForProgramme,
  type MessageableMember,
} from '@/app/lib/control-centre-db'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthFromRequest(request)
  if (!auth || !auth.coachId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const promotion = await getPromotion(params.id)
  if (!promotion) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (promotion.created_by !== auth.coachId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const targets = await getPromotionTargets(params.id)
  const byJid = new Map<string, MessageableMember>()
  for (const t of targets) {
    const members = await listMessageableMembersForProgramme(t.programme_id)
    for (const m of members) {
      // Keep the first sighting, but never let an opted-out row mask a
      // contactable one for the same person.
      const existing = byJid.get(m.jid)
      if (!existing || (existing.opted_out && !m.opted_out)) {
        byJid.set(m.jid, m)
      }
    }
  }

  const members = Array.from(byJid.values()).sort((a, b) =>
    a.display_name.localeCompare(b.display_name)
  )
  return NextResponse.json({ members })
}
