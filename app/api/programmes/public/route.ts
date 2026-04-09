export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'

// GET: public programme info for the booking page — no auth required
export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Programme ID required' }, { status: 400 })
    }

    const { rows } = await sql.query(`
      SELECT
        p.id,
        p.programme_name,
        p.short_description,
        p.target_audience,
        p.specific_age_group,
        p.skill_level,
        p.programme_type,
        p.session_days,
        p.session_start_time,
        p.session_duration,
        p.session_frequency,
        p.holiday_schedule,
        p.venue_name,
        p.venue_address,
        p.indoor_outdoor,
        p.parking,
        p.nearest_transport,
        p.max_capacity,
        p.current_members,
        p.programme_status,
        p.trial_available,
        p.trial_instructions,
        p.what_to_bring,
        p.equipment_provided,
        p.kit_required,
        p.kit_details,
        p.paid_or_free,
        p.payment_model,
        p.price_gbp,
        p.price_includes,
        p.sibling_discount,
        p.payment_methods,
        p.waitlist_enabled,
        c.first_name as coach_first_name,
        c.last_name as coach_last_name,
        c.sport,
        c.coaching_level,
        c.dbs_status,
        c.first_aid,
        pr.trading_name
      FROM programmes p
      JOIN coaches_v2 c ON c.id = p.coach_id
      JOIN providers pr ON pr.id = c.provider_id
      WHERE p.id = $1 AND p.is_active = true
      LIMIT 1
    `, [id])

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Programme not found' }, { status: 404 })
    }

    const prog = rows[0]

    // Get active member count for capacity check
    const memberResult = await sql.query(
      "SELECT COUNT(*)::int as count FROM members WHERE programme_id = $1 AND status = 'active'",
      [id]
    )
    const activeMemberCount = memberResult.rows[0]?.count || 0

    // Get waitlist count
    const waitlistResult = await sql.query(
      "SELECT COUNT(*)::int as count FROM members WHERE programme_id = $1 AND status = 'waitlisted'",
      [id]
    )
    const waitlistCount = waitlistResult.rows[0]?.count || 0

    // Calculate availability
    const maxCapacity = prog.max_capacity || 0
    const spotsLeft = maxCapacity > 0 ? Math.max(0, maxCapacity - activeMemberCount) : null
    const isFull = maxCapacity > 0 && activeMemberCount >= maxCapacity

    return NextResponse.json({
      programme: {
        ...prog,
        activeMemberCount,
        waitlistCount,
        spotsLeft,
        isFull,
      },
    })
  } catch (error) {
    console.error('Public programme error:', error)
    return NextResponse.json({ error: 'Failed to load programme' }, { status: 500 })
  }
}
