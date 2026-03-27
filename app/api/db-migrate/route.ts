// One-time migration route — adds knowledgebase column to programs table.
// Hit POST /api/db-migrate once after deploying, then this route is safe to leave (idempotent).
import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'

export async function POST() {
  try {
    await sql`
      ALTER TABLE programs
      ADD COLUMN IF NOT EXISTS knowledgebase JSONB
    `
    return NextResponse.json({ success: true, message: 'Migration complete' })
  } catch (error) {
    console.error('Migration error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
