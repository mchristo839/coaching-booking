import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/app/lib/auth'
import { getPoll, closePoll } from '@/app/lib/control-centre-db'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthFromRequest(request)
  if (!auth || !auth.coachId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  const poll = await getPoll(params.id)
  if (!poll) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (poll.created_by !== auth.coachId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  await closePoll(params.id)
  return NextResponse.json({ success: true })
}
