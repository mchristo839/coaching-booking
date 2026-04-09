export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'

export async function GET() {
  try {
    const { rows } = await sql`SELECT p.*, (SELECT COUNT(*) FROM members m WHERE m.programme_id = p.id AND m.status = 'active') as member_count FROM programmes p LIMIT 5`
    // Return raw keys to see exact format
    const rawKeys = rows.length > 0 ? Object.keys(rows[0]) : []
    const whatsappField = rawKeys.find(k => k.toLowerCase().includes('whatsapp'))
    return NextResponse.json({
      rawKeys,
      whatsappField,
      whatsappValue: rows[0]?.[whatsappField || 'whatsapp_group_id'],
      row: rows[0]
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
