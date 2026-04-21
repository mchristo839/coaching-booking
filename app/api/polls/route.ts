// app/api/polls/route.ts
// POST: Create + send a poll to selected groups.
// GET: List polls created by the current coach.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/app/lib/auth'
import { getAuthorisedProgrammes, requireAuthorityOver, PermissionError } from '@/app/lib/permissions'
import { createPoll, getPollTargets, listPollsForCoach, logNotification, setPollTargetMessageId } from '@/app/lib/control-centre-db'
import { sendWhatsAppPoll } from '@/app/lib/evolution'

export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth || !auth.coachId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { question, options, responseType, closesAt, anonymous, sendMode, programmeIds } = body

    if (!question || !Array.isArray(options) || options.length < 2 || options.length > 6) {
      return NextResponse.json(
        { error: 'question required; options must be 2-6 items' },
        { status: 400 }
      )
    }

    const authorisedProgrammes = await getAuthorisedProgrammes(auth.coachId)
    let resolvedProgrammeIds: string[] =
      sendMode === 'all_groups'
        ? authorisedProgrammes.map((p) => p.programme_id)
        : Array.isArray(programmeIds) ? programmeIds : []

    if (sendMode !== 'all_groups') {
      await requireAuthorityOver(auth.coachId, resolvedProgrammeIds)
    }

    if (resolvedProgrammeIds.length === 0) {
      return NextResponse.json({ error: 'No target programmes' }, { status: 400 })
    }

    const poll = await createPoll({
      createdBy: auth.coachId,
      question,
      options,
      responseType: responseType || 'single',
      closesAt: closesAt || null,
      anonymous: !!anonymous,
      programmeIds: resolvedProgrammeIds,
    })

    const targets = await getPollTargets(poll.id)
    const selectableCount = (responseType || 'single') === 'multiple' ? options.length : 1

    let sentCount = 0
    let failedCount = 0

    for (const target of targets) {
      if (!target.whatsapp_group_id) {
        failedCount++
        continue
      }
      try {
        const { messageId } = await sendWhatsAppPoll(
          target.whatsapp_group_id,
          question,
          options,
          selectableCount
        )
        if (messageId) {
          await setPollTargetMessageId(poll.id, target.programme_id, messageId)
        }
        await logNotification({
          eventType: 'poll_sent',
          triggerUser: auth.coachId,
          programmeId: target.programme_id,
          recipientType: 'group',
          recipientJid: target.whatsapp_group_id,
          status: 'sent',
        })
        sentCount++
      } catch (err) {
        await logNotification({
          eventType: 'poll_sent',
          triggerUser: auth.coachId,
          programmeId: target.programme_id,
          recipientType: 'group',
          recipientJid: target.whatsapp_group_id,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        })
        failedCount++
      }
    }

    return NextResponse.json({
      poll,
      sent: sentCount,
      failed: failedCount,
    })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('[POLLS POST] error:', error)
    return NextResponse.json({ error: 'Failed to create poll' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth || !auth.coachId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  const polls = await listPollsForCoach(auth.coachId)
  return NextResponse.json({ polls })
}
