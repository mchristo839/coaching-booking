// app/lib/db.ts
// SERVER-SIDE ONLY: Never import this in client components.
// All client components call fetch('/api/...') instead.

import { sql } from '@vercel/postgres'

// ─── Coaches ───

export async function findCoachByEmail(email: string) {
  const { rows } = await sql`
    SELECT * FROM coaches WHERE email = ${email} LIMIT 1
  `
  return rows[0] || null
}

export async function createCoach(email: string, name: string, passwordHash: string) {
  const { rows } = await sql`
    INSERT INTO coaches (email, name, password_hash)
    VALUES (${email}, ${name}, ${passwordHash})
    RETURNING *
  `
  return rows[0]
}

// ─── Programs ───

export interface Knowledgebase {
  sport: string
  venue: string
  venueAddress: string
  ageGroup: string
  skillLevel: string
  schedule: string
  priceCents: number
  whatToBring: string
  cancellationPolicy: string
  medicalInfo: string
  coachBio: string
  customFaqs: { q: string; a: string }[]
}

export async function createProgram(
  coachId: string,
  programName: string,
  knowledgebase?: Knowledgebase
) {
  const kb = knowledgebase ? JSON.stringify(knowledgebase) : null
  const { rows } = await sql`
    INSERT INTO programs (coach_id, program_name, knowledgebase)
    VALUES (${coachId}, ${programName}, ${kb}::jsonb)
    RETURNING *
  `
  return rows[0]
}

export async function listProgramsByCoach(coachId: string) {
  const { rows } = await sql`
    SELECT * FROM programs
    WHERE coach_id = ${coachId}
    ORDER BY created_at DESC
  `
  return rows
}

export async function findProgram(programId: string) {
  const { rows } = await sql`
    SELECT * FROM programs WHERE id = ${programId} LIMIT 1
  `
  return rows[0] || null
}

export async function updateProgram(
  programId: string,
  fields: {
    programName?: string
    knowledgebase?: Knowledgebase
    whatsappGroupId?: string
  }
) {
  const kb = fields.knowledgebase !== undefined ? JSON.stringify(fields.knowledgebase) : null
  const { rows } = await sql`
    UPDATE programs SET
      program_name = COALESCE(${fields.programName ?? null}, program_name),
      knowledgebase = COALESCE(${kb}::jsonb, knowledgebase),
      whatsapp_group_id = COALESCE(${fields.whatsappGroupId ?? null}, whatsapp_group_id)
    WHERE id = ${programId}
    RETURNING *
  `
  return rows[0]
}

export async function findProgramWithCoach(programId: string, coachId: string) {
  const { rows } = await sql`
    SELECT * FROM programs WHERE id = ${programId} AND coach_id = ${coachId} LIMIT 1
  `
  return rows[0] || null
}

export async function findProgramByWhatsAppGroup(whatsappGroupId: string) {
  const { rows } = await sql`
    SELECT p.*, c.name as coach_name, c.email as coach_email, c.whatsapp_jid as coach_whatsapp_jid
    FROM programs p
    JOIN coaches c ON c.id = p.coach_id
    WHERE p.whatsapp_group_id = ${whatsappGroupId} AND p.is_active = true
  `
  return rows[0] || null
}

// ─── Coach WhatsApp JID ───

export async function updateCoachWhatsAppJid(coachId: string, jid: string) {
  await sql`UPDATE coaches SET whatsapp_jid = ${jid} WHERE id = ${coachId}`
}

export async function getCoachByWhatsAppJid(jid: string) {
  const { rows } = await sql`SELECT * FROM coaches WHERE whatsapp_jid = ${jid} LIMIT 1`
  return rows[0] || null
}

// ─── Bot Reply Rate Limiting ───

export async function canSendBotReply(groupJid: string, replyType: string, cooldownMinutes = 60): Promise<boolean> {
  const { rows } = await sql`
    SELECT 1 FROM bot_replies
    WHERE group_jid = ${groupJid}
      AND reply_type = ${replyType}
      AND sent_at > NOW() - INTERVAL '1 minute' * ${cooldownMinutes}
    LIMIT 1
  `
  return rows.length === 0
}

export async function recordBotReply(groupJid: string, replyType: string): Promise<void> {
  await sql`INSERT INTO bot_replies (group_jid, reply_type) VALUES (${groupJid}, ${replyType})`
}

// ─── Message Log ───

export async function logMessage(params: {
  programId: string | null
  groupJid: string
  senderJid: string
  senderName: string
  messageText: string
  isFromCoach: boolean
  isFromBot: boolean
}): Promise<void> {
  await sql`
    INSERT INTO message_log (program_id, group_jid, sender_jid, sender_name, message_text, is_from_coach, is_from_bot)
    VALUES (${params.programId}, ${params.groupJid}, ${params.senderJid}, ${params.senderName}, ${params.messageText}, ${params.isFromCoach}, ${params.isFromBot})
  `
}

export async function getRecentMessages(groupJid: string, limit = 15) {
  const { rows } = await sql`
    SELECT sender_name, message_text, is_from_coach, is_from_bot, created_at
    FROM message_log
    WHERE group_jid = ${groupJid}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `
  return rows.reverse() // chronological order
}

export async function getRecentQuestions(groupJid: string, limit = 5) {
  const { rows } = await sql`
    SELECT sender_name, message_text, created_at
    FROM message_log
    WHERE group_jid = ${groupJid}
      AND is_from_coach = false
      AND is_from_bot = false
    ORDER BY created_at DESC
    LIMIT ${limit}
  `
  return rows.reverse()
}

export async function appendCustomFaq(programId: string, q: string, a: string): Promise<void> {
  await sql`
    UPDATE programs
    SET knowledgebase = jsonb_set(
      COALESCE(knowledgebase, '{}'),
      '{customFaqs}',
      COALESCE(knowledgebase->'customFaqs', '[]'::jsonb) || ${JSON.stringify({ q, a })}::jsonb
    )
    WHERE id = ${programId}
  `
}
