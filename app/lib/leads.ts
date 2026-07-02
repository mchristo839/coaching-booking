// app/lib/leads.ts
// DB access for the leads pipeline (sales-funnel tracking for clients like
// Zenith Gyms — lead -> free trial -> 21-day sign-up -> joined -> ex-member).
// Manual/form intake for now; see db-migrate/route.ts for the schema + the
// full stage enum.

import { sql } from '@/app/lib/sql'

export type LeadSource = 'website' | 'email_phone' | 'calendly' | 'meta' | 'other'

export type LeadStage =
  | 'lead'
  | 'no_interest'
  | 'free_trial_booked'
  | 'no_show_cancel'
  | 'free_trial_not_joined'
  | 'signup_21day'
  | 'not_joined_21day'
  | 'joined'
  | 'ex_member'

export const LEAD_STAGES: LeadStage[] = [
  'lead',
  'no_interest',
  'free_trial_booked',
  'no_show_cancel',
  'free_trial_not_joined',
  'signup_21day',
  'not_joined_21day',
  'joined',
  'ex_member',
]

export interface Lead {
  id: string
  coach_id: string
  name: string
  phone: string | null
  email: string | null
  source: LeadSource
  stage: LeadStage
  trial_date: string | null
  notes: string | null
  created_at: string
  stage_changed_at: string
  updated_at: string
}

export async function listLeadsByCoach(coachId: string): Promise<Lead[]> {
  const { rows } = await sql`
    SELECT id, coach_id, name, phone, email, source, stage,
           trial_date::text, notes,
           created_at::text, stage_changed_at::text, updated_at::text
    FROM leads
    WHERE coach_id = ${coachId}
    ORDER BY created_at DESC
  `
  return rows as Lead[]
}

export async function getLeadForCoach(id: string, coachId: string): Promise<Lead | null> {
  const { rows } = await sql`
    SELECT id, coach_id, name, phone, email, source, stage,
           trial_date::text, notes,
           created_at::text, stage_changed_at::text, updated_at::text
    FROM leads
    WHERE id = ${id} AND coach_id = ${coachId}
    LIMIT 1
  `
  return (rows[0] as Lead) || null
}

export async function createLead(input: {
  coachId: string
  name: string
  phone?: string | null
  email?: string | null
  source: LeadSource
  trialDate?: string | null
  notes?: string | null
}): Promise<Lead> {
  const { rows } = await sql`
    INSERT INTO leads (coach_id, name, phone, email, source, trial_date, notes)
    VALUES (
      ${input.coachId}, ${input.name}, ${input.phone || null}, ${input.email || null},
      ${input.source}, ${input.trialDate || null}, ${input.notes || null}
    )
    RETURNING id, coach_id, name, phone, email, source, stage,
              trial_date::text, notes,
              created_at::text, stage_changed_at::text, updated_at::text
  `
  return rows[0] as Lead
}

// Full-replacement edit of the editable fields (not stage — use setLeadStage
// so stage_changed_at stays accurate).
export async function updateLead(
  id: string,
  coachId: string,
  input: {
    name?: string
    phone?: string | null
    email?: string | null
    source?: LeadSource
    trialDate?: string | null
    notes?: string | null
  }
): Promise<Lead | null> {
  const existing = await getLeadForCoach(id, coachId)
  if (!existing) return null

  const { rows } = await sql`
    UPDATE leads SET
      name = ${input.name ?? existing.name},
      phone = ${input.phone !== undefined ? input.phone : existing.phone},
      email = ${input.email !== undefined ? input.email : existing.email},
      source = ${input.source ?? existing.source},
      trial_date = ${input.trialDate !== undefined ? input.trialDate : existing.trial_date},
      notes = ${input.notes !== undefined ? input.notes : existing.notes},
      updated_at = NOW()
    WHERE id = ${id} AND coach_id = ${coachId}
    RETURNING id, coach_id, name, phone, email, source, stage,
              trial_date::text, notes,
              created_at::text, stage_changed_at::text, updated_at::text
  `
  return (rows[0] as Lead) || null
}

export async function setLeadStage(id: string, coachId: string, stage: LeadStage): Promise<Lead | null> {
  const { rows } = await sql`
    UPDATE leads
    SET stage = ${stage}, stage_changed_at = NOW(), updated_at = NOW()
    WHERE id = ${id} AND coach_id = ${coachId}
    RETURNING id, coach_id, name, phone, email, source, stage,
              trial_date::text, notes,
              created_at::text, stage_changed_at::text, updated_at::text
  `
  return (rows[0] as Lead) || null
}

export async function deleteLead(id: string, coachId: string): Promise<boolean> {
  const { rowCount } = await sql`DELETE FROM leads WHERE id = ${id} AND coach_id = ${coachId}`
  return (rowCount ?? 0) > 0
}
