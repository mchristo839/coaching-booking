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
  if (fields.programName !== undefined) {
    await sql`UPDATE programs SET program_name = ${fields.programName} WHERE id = ${programId}`
  }
  if (fields.knowledgebase !== undefined) {
    const kb = JSON.stringify(fields.knowledgebase)
    await sql`UPDATE programs SET knowledgebase = ${kb}::jsonb WHERE id = ${programId}`
  }
  if (fields.whatsappGroupId !== undefined) {
    await sql`UPDATE programs SET whatsapp_group_id = ${fields.whatsappGroupId} WHERE id = ${programId}`
  }
  const { rows } = await sql`SELECT * FROM programs WHERE id = ${programId}`
  return rows[0]
}

export async function findProgramByWhatsAppGroup(whatsappGroupId: string) {
  const { rows } = await sql`
    SELECT p.*, c.name as coach_name, c.email as coach_email
    FROM programs p
    JOIN coaches c ON c.id = p.coach_id
    WHERE p.whatsapp_group_id = ${whatsappGroupId} AND p.is_active = true
  `
  return rows[0] || null
}
