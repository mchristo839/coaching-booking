// app/api/referrals/route.ts
// GET: list all referrals for the current coach (across all their promotions).

import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/app/lib/auth'
import { listReferralsForCoach } from '@/app/lib/control-centre-db'

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth || !auth.coachId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  const referrals = await listReferralsForCoach(auth.coachId)
  return NextResponse.json({ referrals })
}
