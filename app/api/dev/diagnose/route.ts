// app/api/dev/diagnose/route.ts
// Dump the current state of the DB relevant to the Coach Control Centre.
// Bearer token protected. Read-only.

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'

function isAuthorised(request: NextRequest): boolean {
  const secret = process.env.HEALTH_CHECK_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  try {
    const [
      providersCount,
      coachesV2Count,
      programmesCount,
      coachesOldCount,
      programsOldCount,
      conversationsCount,
      providers,
      coachesV2,
      programmes,
      oldCoaches,
      oldPrograms,
      paulGroupV2,
      paulGroupOld,
      providerStaff,
      programmeAssignments,
    ] = await Promise.all([
      sql`SELECT COUNT(*)::int FROM providers`,
      sql`SELECT COUNT(*)::int FROM coaches_v2`,
      sql`SELECT COUNT(*)::int FROM programmes`,
      sql`SELECT COUNT(*)::int FROM coaches`,
      sql`SELECT COUNT(*)::int FROM programs`,
      sql`SELECT COUNT(*)::int FROM conversations`,
      sql`SELECT id, email, first_name, last_name, trading_name, registration_status FROM providers`,
      sql`SELECT c.id, c.provider_id, c.email, c.first_name, c.last_name, c.mobile, c.whatsapp_bot_status FROM coaches_v2 c`,
      sql`SELECT id, coach_id, programme_name, whatsapp_group_id, is_active FROM programmes`,
      sql`SELECT id, email, name FROM coaches`,
      sql`SELECT id, coach_id, program_name, whatsapp_group_id, is_active FROM programs`,
      sql`SELECT id, programme_name, coach_id FROM programmes WHERE whatsapp_group_id = '120363422695360945@g.us'`,
      sql`SELECT id, program_name, coach_id FROM programs WHERE whatsapp_group_id = '120363422695360945@g.us'`,
      sql`SELECT * FROM provider_staff`,
      sql`SELECT * FROM programme_assignments`,
    ])

    return NextResponse.json({
      counts: {
        providers: providersCount.rows[0].count,
        coaches_v2: coachesV2Count.rows[0].count,
        programmes: programmesCount.rows[0].count,
        coaches_old: coachesOldCount.rows[0].count,
        programs_old: programsOldCount.rows[0].count,
        conversations: conversationsCount.rows[0].count,
      },
      providers: providers.rows,
      coaches_v2: coachesV2.rows,
      programmes: programmes.rows,
      old_coaches: oldCoaches.rows,
      old_programs: oldPrograms.rows,
      paul_group_v2_match: paulGroupV2.rows,
      paul_group_old_match: paulGroupOld.rows,
      provider_staff: providerStaff.rows,
      programme_assignments: programmeAssignments.rows,
    })
  } catch (error) {
    console.error('[DIAGNOSE] error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
