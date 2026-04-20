// app/api/schedule/exceptions/route.ts
// Cancel or reschedule a single instance of a recurring series.
// Triggers the internal-first, external-second notification cascade.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/app/lib/auth'
import { requireAuthorityOver, PermissionError } from '@/app/lib/permissions'
import { createException, getSeries } from '@/app/lib/control-centre-db'
import { generateCancellationMessage } from '@/app/lib/ai-messages'
import { notifyCascade } from '@/app/lib/notify'
import { sql } from '@vercel/postgres'

export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth || !auth.coachId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { seriesId, originalDate, status, rescheduledTo, reason } = body

    if (!seriesId || !originalDate || !status) {
      return NextResponse.json(
        { error: 'seriesId, originalDate, status required' },
        { status: 400 }
      )
    }
    if (status !== 'cancelled' && status !== 'rescheduled') {
      return NextResponse.json({ error: 'status must be cancelled or rescheduled' }, { status: 400 })
    }

    const series = await getSeries(seriesId)
    if (!series) return NextResponse.json({ error: 'Series not found' }, { status: 404 })

    await requireAuthorityOver(auth.coachId, [series.programme_id])

    const exception = await createException({
      seriesId,
      originalDate,
      status,
      rescheduledTo: rescheduledTo || null,
      reason: reason || null,
      cancelledBy: auth.coachId,
    })

    // Load programme + coach context for AI messages
    const { rows: progRows } = await sql`
      SELECT p.programme_name, p.whatsapp_group_id
      FROM programmes p WHERE p.id = ${series.programme_id} LIMIT 1
    `
    const { rows: coachRows } = await sql`
      SELECT first_name, last_name FROM coaches_v2 WHERE id = ${auth.coachId} LIMIT 1
    `
    const programmeName = progRows[0]?.programme_name || 'your programme'
    const groupJid = progRows[0]?.whatsapp_group_id || null
    const coachName = coachRows[0]
      ? `${coachRows[0].first_name} ${coachRows[0].last_name}`.trim()
      : 'Coach'

    // Generate cancellation message
    let externalMessage = ''
    try {
      externalMessage = await generateCancellationMessage({
        sessionType: series.series_type === 'training' ? 'training' : 'fixture',
        date: originalDate,
        reason: reason || null,
        rescheduleTo: rescheduledTo || null,
        coachName,
        programmeName,
      })
    } catch {
      const dateStr = new Date(originalDate).toLocaleDateString('en-GB')
      externalMessage = status === 'cancelled'
        ? `Unfortunately ${series.series_type} on ${dateStr} is cancelled${reason ? `: ${reason}` : '.'}`
        : `${series.series_type} originally on ${dateStr} has been rescheduled to ${rescheduledTo ? new Date(rescheduledTo).toLocaleString('en-GB') : 'TBC'}.`
    }

    const internalMessage = `[${programmeName}] ${coachName} ${status} ${series.series_type} on ${new Date(originalDate).toLocaleDateString('en-GB')}${reason ? ` — ${reason}` : ''}. External notification ${groupJid ? 'being sent' : 'will not be sent (no group linked)'}.`

    // Run cascade — internal first, external blocked on failure
    const cascade = await notifyCascade({
      programmeId: series.programme_id,
      groupJid,
      triggerCoachId: auth.coachId,
      eventType: status === 'cancelled' ? 'cancellation' : 'reschedule',
      internalMessage,
      externalMessage,
    })

    return NextResponse.json({
      exception,
      externalMessage,
      cascade,
    })
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('[SCHEDULE EXCEPTIONS POST] error:', error)
    return NextResponse.json({ error: 'Failed to create exception' }, { status: 500 })
  }
}
