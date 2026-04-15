// One-time migration route — run POST /api/db-migrate after each deploy with schema changes.
// All statements are idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'

export async function POST() {
  try {
    // Knowledgebase JSONB column on programs
    await sql`ALTER TABLE programs ADD COLUMN IF NOT EXISTS knowledgebase JSONB`

    // Coach WhatsApp JID for learning system
    await sql`ALTER TABLE coaches ADD COLUMN IF NOT EXISTS whatsapp_jid TEXT`

    // Rate-limit auto-replies (unlinked group, no knowledgebase)
    await sql`
      CREATE TABLE IF NOT EXISTS bot_replies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        group_jid TEXT NOT NULL,
        reply_type TEXT NOT NULL,
        sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
    await sql`
      CREATE INDEX IF NOT EXISTS idx_bot_replies_lookup
      ON bot_replies (group_jid, reply_type, sent_at)
    `

    // Message log for conversation context and learning
    await sql`
      CREATE TABLE IF NOT EXISTS message_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        program_id UUID,
        group_jid TEXT NOT NULL,
        sender_jid TEXT NOT NULL,
        sender_name TEXT,
        message_text TEXT NOT NULL,
        is_from_coach BOOLEAN DEFAULT FALSE,
        is_from_bot BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
    await sql`
      CREATE INDEX IF NOT EXISTS idx_message_log_group
      ON message_log (group_jid, created_at DESC)
    `

    return NextResponse.json({ success: true, message: 'All migrations complete' })
  } catch (error) {
    console.error('Migration error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
