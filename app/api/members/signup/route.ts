export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      programmeId,
      parentName,
      parentEmail,
      parentPhone,
      childName,
      childDob,
      medicalNotes,
      source, // 'web' | 'whatsapp'
    } = body

    if (!programmeId || !parentName) {
      return NextResponse.json({ error: 'Programme ID and parent name are required' }, { status: 400 })
    }

    // 1. Check programme exists and is active
    const { rows: progRows } = await sql.query(`
      SELECT p.id, p.programme_name, p.max_capacity, p.waitlist_enabled, p.programme_status,
        p.trial_available, p.price_gbp, p.payment_model, p.coach_id,
        c.first_name as coach_first_name, c.last_name as coach_last_name, c.mobile as coach_mobile,
        pr.trading_name
      FROM programmes p
      JOIN coaches_v2 c ON c.id = p.coach_id
      JOIN providers pr ON pr.id = c.provider_id
      WHERE p.id = $1 AND p.is_active = true
      LIMIT 1
    `, [programmeId])

    if (progRows.length === 0) {
      return NextResponse.json({ error: 'Programme not found or inactive' }, { status: 404 })
    }

    const prog = progRows[0]

    // 2. Check for duplicate (same email or phone + same programme)
    if (parentEmail) {
      const { rows: dupeCheck } = await sql.query(
        "SELECT id FROM members WHERE programme_id = $1 AND parent_email = $2 AND status IN ('active', 'trial', 'waitlisted')",
        [programmeId, parentEmail]
      )
      if (dupeCheck.length > 0) {
        return NextResponse.json({
          error: 'Already enrolled',
          message: `You're already signed up for ${prog.programme_name}. If you need to make changes, please contact the coach.`,
        }, { status: 409 })
      }
    }

    // 3. Check capacity
    const { rows: countRows } = await sql.query(
      "SELECT COUNT(*)::int as count FROM members WHERE programme_id = $1 AND status IN ('active', 'trial')",
      [programmeId]
    )
    const activeMemberCount = countRows[0]?.count || 0
    const maxCapacity = prog.max_capacity || 0
    const isFull = maxCapacity > 0 && activeMemberCount >= maxCapacity

    // 4. Determine status
    let memberStatus = 'active'
    let waitlistPosition = null

    if (isFull) {
      if (!prog.waitlist_enabled) {
        return NextResponse.json({
          error: 'Programme full',
          message: `Sorry, ${prog.programme_name} is currently full and the waitlist is not open. Please contact the coach for more information.`,
        }, { status: 409 })
      }
      memberStatus = 'waitlisted'
      // Get next waitlist position
      const { rows: wlRows } = await sql.query(
        "SELECT COALESCE(MAX(waitlist_position), 0) + 1 as next_pos FROM members WHERE programme_id = $1 AND status = 'waitlisted'",
        [programmeId]
      )
      waitlistPosition = wlRows[0]?.next_pos || 1
    } else if (prog.trial_available === 'yes' || prog.trial_available === 'first_session_free') {
      memberStatus = 'trial'
    }

    // 5. Create member
    const { rows: memberRows } = await sql.query(`
      INSERT INTO members (
        programme_id, parent_name, parent_email, parent_phone,
        child_name, child_dob, medical_flag, status, waitlist_position
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      programmeId,
      parentName,
      parentEmail || null,
      parentPhone || null,
      childName || null,
      childDob || null,
      medicalNotes ? true : false,
      memberStatus,
      waitlistPosition,
    ])

    const member = memberRows[0]

    // 6. If there are medical notes, save them as a conversation note for the coach
    if (medicalNotes && medicalNotes.trim()) {
      await sql.query(`
        INSERT INTO conversations (programme_id, coach_id, sender_name, sender_identifier, sender_type, channel, message_text, category, bot_response, bot_mode, escalated, escalation_type)
        VALUES ($1, $2, $3, $4, 'unknown', $5, $6, 'medical', $7, 'live', true, 'medical')
      `, [
        programmeId,
        prog.coach_id,
        parentName,
        parentEmail || parentPhone || 'web-signup',
        source === 'whatsapp' ? 'whatsapp_private' : 'web',
        `New signup medical note from ${parentName}: ${medicalNotes}`,
        `Medical note flagged for coach review. Member: ${parentName}${childName ? `, Child: ${childName}` : ''}`,
      ])
    }

    // 7. Update programme current_members count
    await sql.query(
      "UPDATE programmes SET current_members = (SELECT COUNT(*)::int FROM members WHERE programme_id = $1 AND status IN ('active', 'trial')), updated_at = NOW() WHERE id = $1",
      [programmeId]
    )

    // 8. Build response
    const coachName = `${prog.coach_first_name || ''} ${prog.coach_last_name || ''}`.trim()

    let message = ''
    if (memberStatus === 'waitlisted') {
      message = `You've been added to the waitlist for ${prog.programme_name} (position ${waitlistPosition}). ${coachName} will be in touch when a space becomes available.`
    } else if (memberStatus === 'trial') {
      message = `Welcome to ${prog.programme_name}! You've been signed up for a trial session. ${coachName} will be in touch with details.`
    } else {
      message = `Welcome to ${prog.programme_name}! You're all signed up. ${coachName} will be in touch with next steps.`
    }

    if (prog.price_gbp && memberStatus !== 'waitlisted') {
      message += `\n\nPayment: ${prog.payment_model || 'Per session'} — ${prog.price_gbp ? `£${prog.price_gbp}` : 'See coach for details'}.`
    }

    return NextResponse.json({
      success: true,
      member,
      status: memberStatus,
      waitlistPosition,
      message,
      programme: {
        name: prog.programme_name,
        coachName,
        tradingName: prog.trading_name,
      },
    })
  } catch (error) {
    console.error('Member signup error:', error)
    return NextResponse.json({ error: 'Failed to sign up. Please try again.' }, { status: 500 })
  }
}
