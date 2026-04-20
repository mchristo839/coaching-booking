// app/api/referrals/[id]/status/route.ts
// Coach updates a referral's status (confirmed / attended / converted / lapsed).

import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/app/lib/auth'
import { updateReferralStatus } from '@/app/lib/control-centre-db'
import { sql } from '@vercel/postgres'

const VALID = ['confirmed', 'attended', 'converted', 'lapsed']

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthFromRequest(request)
  if (!auth || !auth.coachId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { status } = await request.json()
  if (!VALID.includes(status)) {
    return NextResponse.json({ error: `status must be one of ${VALID.join(', ')}` }, { status: 400 })
  }

  // Only allow the creator of the promotion to update
  const { rows } = await sql`
    SELECT pr.created_by FROM referrals r
    JOIN promotions pr ON pr.id = r.promotion_id
    WHERE r.id = ${params.id}
    LIMIT 1
  `
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (rows[0].created_by !== auth.coachId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await updateReferralStatus(params.id, status as 'confirmed' | 'attended' | 'converted' | 'lapsed')
  return NextResponse.json({ success: true })
}
