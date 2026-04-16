// Migration route — idempotent, safe to run multiple times.
// Hit POST /api/db-migrate after deploying.
import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'

export async function POST() {
  try {
    // Original migration: knowledgebase column
    await sql`
      ALTER TABLE programs
      ADD COLUMN IF NOT EXISTS knowledgebase JSONB
    `

    // Alert dedup log (Task 1)
    await sql`
      CREATE TABLE IF NOT EXISTS alert_log (
        id SERIAL PRIMARY KEY,
        alert_key TEXT NOT NULL,
        severity TEXT NOT NULL,
        message TEXT NOT NULL,
        sent_at TIMESTAMP DEFAULT NOW()
      )
    `
    await sql`
      CREATE INDEX IF NOT EXISTS idx_alert_log_key_sent
      ON alert_log(alert_key, sent_at DESC)
    `

    // Conversation log (Task 1 schema, Task 2 populates)
    await sql`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        programme_id TEXT,
        group_jid TEXT,
        sender_jid TEXT,
        sender_name TEXT,
        message_text TEXT,
        bot_response TEXT,
        category TEXT,
        escalated BOOLEAN DEFAULT FALSE,
        escalation_acked_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `

    // Bot reply tracking (Task 1 schema, Task 3 populates)
    await sql`
      CREATE TABLE IF NOT EXISTS bot_replies (
        id SERIAL PRIMARY KEY,
        group_jid TEXT NOT NULL,
        reply_type TEXT,
        message_id TEXT,
        sent_at TIMESTAMP DEFAULT NOW()
      )
    `

    // Message dedup (Task 3)
    await sql`
      CREATE TABLE IF NOT EXISTS processed_messages (
        message_id TEXT PRIMARY KEY,
        processed_at TIMESTAMP DEFAULT NOW()
      )
    `
    await sql`
      CREATE INDEX IF NOT EXISTS idx_processed_messages_age
      ON processed_messages(processed_at)
    `

    // Health check state tracking
    await sql`
      CREATE TABLE IF NOT EXISTS health_state (
        check_name TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        consecutive_failures INTEGER DEFAULT 0,
        last_checked_at TIMESTAMP DEFAULT NOW()
      )
    `

    return NextResponse.json({ success: true, message: 'Migration complete' })
  } catch (error) {
    console.error('Migration error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
