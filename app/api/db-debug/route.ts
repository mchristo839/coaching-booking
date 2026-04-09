export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'

export async function GET() {
  try {
    const { rows } = await sql`SELECT id, programme_name, whatsapp_group_id, skill_level, venue_name, target_audience, coach_id FROM programmes LIMIT 10`
    return NextResponse.json({ programmes: rows })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
