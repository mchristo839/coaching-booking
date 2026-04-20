// app/api/fixtures/route.ts
// POST: Publish a fixture to one programme's group (optionally with availability poll).
// GET: List fixtures created by this coach.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/app/lib/auth'
import { requireAuthorityOver, PermissionError } from '@/app/lib/permissions'
import {
  createFixture,
  createPoll,
  getPollTargets,
  listFixturesForCoach,
  logNotification,
} from '@/app/lib/control-centre-db'
import { generateFixtureMessage } from '@/app/lib/ai-messages'
import { sendWhatsAppMessage } from '@/app/lib/evolution'
import { sql } from '@vercel/postgres'

export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth || !auth.coachId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const {
      programmeId, fixtureType, opposition, homeAway, kickoffAt, meetAt,
      venue, kitNotes, withAvailabilityPoll,
    } = body

    if (!programmeId || !fixtureType || !kickoffAt) {
      return NextResponse.json(
        { error: 'programmeId, fixtureType and kickoffAt are required' },
        { status: 400 }
      )
    }

    await requireAuthorityOver(auth.coachId, [programmeId])

    // Optionally create an availability poll
    let availabilityPollId: string | null = null
    if (withAvailabilityPoll) {
      const poll = await createPoll({
        createdBy: auth.coachId,
        question: `Available for ${fixtureType} vs ${opposition || 'TBC'} on ${new Date(kickoffAt).toLocaleDateString('en-GB')}?`,
        options: ['Available', 'Not available'],
        responseType: 'single',
        closesAt: kickoffAt,
        anonymous: false,
        programmeIds: [programmeId],
      })
      availabilityPollId = poll.id
    }

    const fixture = await createFixture({
      programmeId,
      createdBy: auth.coachId,
      fixtureType,
      opposition: opposition || null,
      homeAway: homeAway || null,
      kickoffAt,
      meetAt: meetAt || null,
      venue: venue || null,
      kitNotes: kitNotes || null,
      availabilityPollId,
    })

    // Get programme + coach for AI context
    const { rows: progRows } = await sql`
      SELECT p.programme_name, p.whatsapp_group_id, c.first_name, c.last_name
      FROM programmes p
      JOIN coaches_v2 c ON c.id = ${auth.coachId}
      WHERE p.id = ${programmeId}
      LIMIT 1
    `
    const prog = progRows[0]
    const coachName = prog ? `${prog.first_name} ${prog.last_name}`.trim() : 'Coach'
    const programmeName = prog?.programme_name || 'the team'
    const groupJid = prog?.whatsapp_group_id

    let message = ''
    try {
      message = await generateFixtureMessage({
        fixtureType,
        opposition: opposition || null,
        homeAway: homeAway || null,
        kickoffAt,
        meetAt: meetAt || null,
        venue: venue || null,
        kitNotes: kitNotes || null,
        coachName,
        programmeName,
      })
    } catch {
      message = `${fixtureType} vs ${opposition || 'TBC'} — ${new Date(kickoffAt).toLocaleString('en-GB')}${venue ? ` @ ${venue}` : ''}`
    }

    // Send fixture message
    if (groupJid) {
      try {
        await sendWhatsAppMessage(groupJid, message)
        await logNotification({
          eventType: 'fixture_published',
          triggerUser: auth.coachId,
          programmeId,
          recipientType: 'group',
          recipientJid: groupJid,
          status: 'sent',
        })

        // If we created an availability poll, also send that
        if (availabilityPollId) {
          const pollTargets = await getPollTargets(availabilityPollId)
          for (const t of pollTargets) {
            if (t.whatsapp_group_id) {
              try {
                await sendWhatsAppMessage(
                  t.whatsapp_group_id,
                  `📊 Quick availability check — reply (a) Available or (b) Not available.`
                )
              } catch (e) {
                console.error('[FIXTURES] availability poll send failed:', e)
              }
            }
          }
        }
      } catch (err) {
        await logNotification({
          eventType: 'fixture_published',
          triggerUser: auth.coachId,
          programmeId,
          recipientType: 'group',
          recipientJid: groupJid,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return NextResponse.json({ fixture, message })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('[FIXTURES POST] error:', error)
    return NextResponse.json({ error: 'Failed to publish fixture' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth || !auth.coachId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  const fixtures = await listFixturesForCoach(auth.coachId)
  return NextResponse.json({ fixtures })
}
