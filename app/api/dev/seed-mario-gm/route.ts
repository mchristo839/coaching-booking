// app/api/dev/seed-mario-gm/route.ts
// One-off seed: make Mario (coaches_v2 8053f174) a GM on Paul's provider
// AND on Paul's alternate providers. Idempotent.
// Bearer-token protected.

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'

const MARIO_COACH_V2_ID = '8053f174-c741-4034-ae89-42c38a99ad98'

function isAuthorised(request: NextRequest): boolean {
  const secret = process.env.HEALTH_CHECK_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function POST(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  try {
    // Find all providers that own at least one programme (except Mario's own)
    const { rows: providers } = await sql`
      SELECT DISTINCT p.id as provider_id, p.email
      FROM providers p
      JOIN coaches_v2 c ON c.provider_id = p.id
      JOIN programmes pr ON pr.coach_id = c.id
      WHERE c.id <> ${MARIO_COACH_V2_ID}
    `

    const added: string[] = []
    const skipped: string[] = []

    for (const prov of providers) {
      const { rowCount } = await sql`
        INSERT INTO provider_staff (provider_id, coach_id, role)
        VALUES (${prov.provider_id}, ${MARIO_COACH_V2_ID}, 'gm')
        ON CONFLICT (provider_id, coach_id) DO NOTHING
      `
      if (rowCount && rowCount > 0) {
        added.push(prov.email)
      } else {
        skipped.push(prov.email)
      }
    }

    return NextResponse.json({
      success: true,
      marioCoachV2Id: MARIO_COACH_V2_ID,
      addedAsGmOn: added,
      alreadyHadAccess: skipped,
    })
  } catch (error) {
    console.error('[SEED] error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
