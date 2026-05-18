// app/api/referrals/public/[slug]/contacts/route.ts
// Public read-only endpoint: returns the list of candidate referrers for a
// refer-a-friend promotion's linked programme. Used by the landing page to
// populate the "Who referred you?" dropdown so the referee picks from a
// known list instead of free-typing a name.
//
// Privacy: only exposes first name + last-initial. No phone, no email,
// no child names. The member's UUID is the resolution key.

import { NextRequest, NextResponse } from 'next/server'
import {
  getPromotionBySlug,
  getPromotionTargets,
  listReferrerCandidatesForProgramme,
} from '@/app/lib/control-centre-db'

export async function GET(
  _request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const promotion = await getPromotionBySlug(params.slug)
  if (!promotion || promotion.promotion_type !== 'refer_a_friend') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const targets = await getPromotionTargets(promotion.id)
  if (targets.length === 0) {
    return NextResponse.json({ contacts: [] })
  }

  // Use the same primary programme the POST handler treats as the referral's
  // programme. Phase 2 may broaden this to all targets; MVP keeps it simple.
  const contacts = await listReferrerCandidatesForProgramme(targets[0].programme_id)
  return NextResponse.json({ contacts })
}
