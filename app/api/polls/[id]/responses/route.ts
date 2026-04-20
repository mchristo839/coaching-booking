import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/app/lib/auth'
import { getPoll, getPollTally, getPollTargets } from '@/app/lib/control-centre-db'
import { sql } from '@vercel/postgres'

export async function GET(
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

  const tally = await getPollTally(params.id)
  const targets = await getPollTargets(params.id)

  // Individual responses (unless anonymous)
  let responses: Record<string, unknown>[] = []
  if (!poll.anonymous) {
    const { rows } = await sql`
      SELECT sender_name, chosen_option, created_at
      FROM poll_responses
      WHERE poll_id = ${params.id}
      ORDER BY created_at DESC
      LIMIT 200
    `
    responses = rows
  }

  return NextResponse.json({ poll, tally, targets, responses })
}
