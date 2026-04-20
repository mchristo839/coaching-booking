// app/lib/permissions.ts
// Central permission checks for the Coach Control Centre.
// Decides which programmes a coach/GM/admin can act on.
// SERVER-SIDE ONLY.

import { sql } from '@vercel/postgres'

export type Role = 'coach_owner' | 'coach_assigned' | 'club_gm' | 'club_admin'

export interface AuthorisedProgramme {
  programme_id: string
  programme_name: string
  role: Role
  whatsapp_group_id: string | null
}

/**
 * Returns every programme a coach has authority over, with the role for each.
 * A single coach can have multiple rows (e.g. owner of one, assigned to another).
 * Deduplicates if the same programme appears via multiple paths (highest role wins:
 * coach_owner > club_gm > club_admin > coach_assigned).
 */
export async function getAuthorisedProgrammes(
  coachId: string
): Promise<AuthorisedProgramme[]> {
  // 1. Programmes owned directly (coach_id on programmes)
  const { rows: owned } = await sql`
    SELECT id as programme_id, programme_name, whatsapp_group_id,
           'coach_owner'::text as role
    FROM programmes
    WHERE coach_id = ${coachId} AND is_active = true
  `

  // 2. Programmes assigned via programme_assignments
  const { rows: assigned } = await sql`
    SELECT p.id as programme_id, p.programme_name, p.whatsapp_group_id,
           'coach_assigned'::text as role
    FROM programmes p
    JOIN programme_assignments pa ON pa.programme_id = p.id
    WHERE pa.coach_id = ${coachId} AND p.is_active = true
  `

  // 3. Programmes where this coach is GM/admin on the provider
  const { rows: staffed } = await sql`
    SELECT p.id as programme_id, p.programme_name, p.whatsapp_group_id,
           CASE ps.role WHEN 'gm' THEN 'club_gm' ELSE 'club_admin' END as role
    FROM programmes p
    JOIN coaches_v2 c ON c.id = p.coach_id
    JOIN provider_staff ps ON ps.provider_id = c.provider_id
    WHERE ps.coach_id = ${coachId} AND p.is_active = true
  `

  // Merge: prefer highest-authority role per programme
  const rank: Record<Role, number> = {
    coach_owner: 4,
    club_gm: 3,
    club_admin: 2,
    coach_assigned: 1,
  }

  const merged = new Map<string, AuthorisedProgramme>()
  for (const row of [...owned, ...staffed, ...assigned]) {
    const r: AuthorisedProgramme = {
      programme_id: row.programme_id,
      programme_name: row.programme_name,
      whatsapp_group_id: row.whatsapp_group_id,
      role: row.role as Role,
    }
    const existing = merged.get(r.programme_id)
    if (!existing || rank[r.role] > rank[existing.role]) {
      merged.set(r.programme_id, r)
    }
  }

  return [...merged.values()].sort((a, b) =>
    a.programme_name.localeCompare(b.programme_name)
  )
}

/**
 * Can this coach post to this specific programme?
 */
export async function canUserPostTo(
  coachId: string,
  programmeId: string
): Promise<boolean> {
  const all = await getAuthorisedProgrammes(coachId)
  return all.some((p) => p.programme_id === programmeId)
}

/**
 * Throws if the coach doesn't have authority over all the given programme IDs.
 * Call this at the start of every send-handler.
 */
export async function requireAuthorityOver(
  coachId: string,
  programmeIds: string[]
): Promise<void> {
  if (programmeIds.length === 0) {
    throw new PermissionError('No programme selected')
  }
  const authorised = await getAuthorisedProgrammes(coachId)
  const allowed = new Set(authorised.map((p) => p.programme_id))
  const denied = programmeIds.filter((id) => !allowed.has(id))
  if (denied.length > 0) {
    throw new PermissionError(
      `Not authorised for programme(s): ${denied.join(', ')}`
    )
  }
}

export class PermissionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PermissionError'
  }
}
