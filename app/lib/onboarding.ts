// app/lib/onboarding.ts
// Flow 0 — Client onboarding state machine.
//
// Triggered when a coach hits "Start onboarding" against a member (or
// when a new prospect converts via Flow 4). The state machine walks the
// member through 8 questions over WhatsApp:
//
//   awaiting_email           → captures email
//   awaiting_dob             → captures DOB (so we can age-check)
//   awaiting_goals           → "what are you hoping to achieve?"
//   awaiting_preferences     → "anything I should know about you?"
//   awaiting_schedule        → preferred days + times
//   awaiting_health_conditions → conditions/injuries/meds (mandatory for PT)
//   awaiting_health_emergency  → emergency contact (mandatory for PT)
//   awaiting_confirm         → recap + "all good?"
//   completed
//
// The conversation is 1:1. We self-gate on tryHandleOnboardingReply so we
// only consume messages from members in an active onboarding session.
//
// SERVER-SIDE ONLY.

import { sql } from '@/app/lib/sql'
import { sendWhatsAppMessage } from '@/app/lib/evolution'

export type OnboardingStep =
  | 'awaiting_email'
  | 'awaiting_dob'
  | 'awaiting_goals'
  | 'awaiting_preferences'
  | 'awaiting_schedule'
  | 'awaiting_health_conditions'
  | 'awaiting_health_emergency'
  | 'awaiting_confirm'
  | 'completed'
  | 'abandoned'

export type OnboardingTrack = 'pt' | 'class'

interface OnboardingAnswers {
  email?: string
  dob?: string
  goals?: string
  preferences?: string
  preferred_days?: string
  preferred_times?: string
  health_conditions?: string
  health_injuries?: string
  health_medications?: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
}

interface OnboardingStateRow {
  id: string
  member_id: string
  coach_id: string | null
  member_jid: string
  track: OnboardingTrack
  step: OnboardingStep
  answers: OnboardingAnswers
}

// ─── Lookups ───

async function findMemberByJid(
  jid: string
): Promise<{ id: string; parent_name: string | null; programme_id: string } | null> {
  const digits = jid.replace(/@.*$/, '').replace(/\D/g, '')
  const { rows } = await sql`
    SELECT id, parent_name, programme_id FROM members
    WHERE parent_whatsapp_id = ${jid}
       OR parent_whatsapp_id = ${digits}
       OR regexp_replace(COALESCE(parent_phone, ''), '\\D', '', 'g') = ${digits}
    LIMIT 1
  `
  return (
    (rows[0] as { id: string; parent_name: string | null; programme_id: string } | undefined) ||
    null
  )
}

async function findOpenStateByJid(jid: string): Promise<OnboardingStateRow | null> {
  const { rows } = await sql`
    SELECT id, member_id, coach_id, member_jid, track, step, answers
    FROM onboarding_state
    WHERE member_jid = ${jid}
      AND step NOT IN ('completed','abandoned')
      AND expires_at > NOW()
    ORDER BY created_at DESC LIMIT 1
  `
  if (!rows[0]) return null
  const r = rows[0] as OnboardingStateRow & { answers: unknown }
  return {
    ...r,
    answers: (typeof r.answers === 'string' ? JSON.parse(r.answers) : r.answers || {}) as OnboardingAnswers,
  }
}

async function saveStep(
  id: string,
  step: OnboardingStep,
  answers: OnboardingAnswers
): Promise<void> {
  await sql`
    UPDATE onboarding_state
    SET step = ${step}, answers = ${JSON.stringify(answers)}::jsonb,
        last_prompt_at = NOW(), updated_at = NOW()
    WHERE id = ${id}
  `
}

// ─── Prompts ───

function promptFor(step: OnboardingStep, name: string | null, track: OnboardingTrack): string {
  const greeting = name ? name.split(' ')[0] : 'there'
  switch (step) {
    case 'awaiting_email':
      return `Hi ${greeting} 👋 Quick onboarding — what's the best email for receipts and updates?`
    case 'awaiting_dob':
      return `Great. What's your date of birth? (e.g. 14/03/1990)`
    case 'awaiting_goals':
      return `What are you hoping to achieve? A short sentence is fine — e.g. "lose 5kg", "get fitter for football", "rehab my knee".`
    case 'awaiting_preferences':
      return `Anything I should know about you? Diet, prior injuries, preferred coaching style, etc. Or just reply "none".`
    case 'awaiting_schedule':
      return `Which days/times work best? e.g. "Mon + Wed evenings" or "weekend mornings".`
    case 'awaiting_health_conditions':
      return track === 'pt'
        ? `Quick health screen 🩺 — any conditions, injuries, or medications I should know about? Reply "none" if not.`
        : `Anything I should know health-wise before your first class? Reply "none" if not.`
    case 'awaiting_health_emergency':
      return `Last one — emergency contact name + number please. e.g. "Sarah, 07700 900123".`
    case 'awaiting_confirm':
      return `All good? Reply "yes" to confirm and I'll activate your profile.`
    case 'completed':
      return `You're all set ✅ Welcome aboard.`
    case 'abandoned':
      return `No worries — ping me anytime to pick this back up.`
  }
}

// ─── Parsers ───

function looksLikeEmail(text: string): string | null {
  const m = text.match(/[^\s@]+@[^\s@]+\.[^\s@]+/)
  return m ? m[0].toLowerCase() : null
}

function parseDob(text: string): string | null {
  // Accept DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`
  }
  const slash = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
  if (slash) {
    const d = slash[1].padStart(2, '0')
    const m = slash[2].padStart(2, '0')
    return `${slash[3]}-${m}-${d}`
  }
  return null
}

function parseEmergencyContact(text: string): { name: string; phone: string } | null {
  // "Sarah, 07700 900123" or "Sarah - 07700900123" or just "Sarah 07700900123"
  const phoneMatch = text.match(/(\+?\d[\d\s-]{7,})/)
  if (!phoneMatch) return null
  const phone = phoneMatch[1].replace(/\s+/g, ' ').trim()
  const name = text.replace(phoneMatch[0], '').replace(/[,\-:]+/g, ' ').trim()
  if (!name) return null
  return { name, phone }
}

function isYes(text: string): boolean {
  return /^(yes|y|yeah|yep|ok|okay|confirm|all good|👍|✅)\b/i.test(text.trim())
}

function isNo(text: string): boolean {
  return /^(no|n|nope|stop|cancel|not now)\b/i.test(text.trim())
}

// ─── Step transitions ───

function nextStep(current: OnboardingStep, track: OnboardingTrack): OnboardingStep {
  switch (current) {
    case 'awaiting_email':
      return 'awaiting_dob'
    case 'awaiting_dob':
      return 'awaiting_goals'
    case 'awaiting_goals':
      return 'awaiting_preferences'
    case 'awaiting_preferences':
      return 'awaiting_schedule'
    case 'awaiting_schedule':
      return 'awaiting_health_conditions'
    case 'awaiting_health_conditions':
      // Class members don't get the emergency-contact prompt
      return track === 'pt' ? 'awaiting_health_emergency' : 'awaiting_confirm'
    case 'awaiting_health_emergency':
      return 'awaiting_confirm'
    case 'awaiting_confirm':
      return 'completed'
    default:
      return current
  }
}

// ─── Public API ───

export async function startOnboarding(
  memberId: string,
  memberJid: string,
  coachId: string,
  track: OnboardingTrack
): Promise<{ ok: true; state_id: string } | { ok: false; error: string }> {
  // Idempotent: if there's already an open session, return it.
  const existing = await findOpenStateByJid(memberJid)
  if (existing) {
    return { ok: true, state_id: existing.id }
  }

  const { rows } = await sql`
    INSERT INTO onboarding_state (member_id, coach_id, member_jid, track, step, answers)
    VALUES (${memberId}, ${coachId}, ${memberJid}, ${track}, 'awaiting_email', '{}'::jsonb)
    RETURNING id
  `
  const id = rows[0]?.id as string | undefined
  if (!id) return { ok: false, error: 'insert_failed' }

  await sql`
    UPDATE members SET onboarding_status = 'in_progress' WHERE id = ${memberId}
  `

  // Look up member name for the greeting
  const { rows: mRows } = await sql`SELECT parent_name FROM members WHERE id = ${memberId}`
  const name = (mRows[0]?.parent_name as string | null) || null
  const firstPrompt = promptFor('awaiting_email', name, track)

  try {
    await sendWhatsAppMessage(memberJid, firstPrompt)
    await sql`UPDATE onboarding_state SET last_prompt_at = NOW() WHERE id = ${id}`
  } catch (e) {
    console.error('[onboarding] first prompt send failed:', e)
  }

  return { ok: true, state_id: id }
}

export async function tryHandleOnboardingReply(jid: string, text: string): Promise<boolean> {
  const state = await findOpenStateByJid(jid)
  if (!state) return false

  // Drop-out
  if (state.step !== 'awaiting_confirm' && isNo(text)) {
    await sql`
      UPDATE onboarding_state SET step = 'abandoned', updated_at = NOW() WHERE id = ${state.id}
    `
    await sql`
      UPDATE members SET onboarding_status = 'stalled' WHERE id = ${state.member_id}
    `
    try {
      await sendWhatsAppMessage(jid, promptFor('abandoned', null, state.track))
    } catch (e) {
      console.error('[onboarding] abandon ack send failed:', e)
    }
    return true
  }

  const answers: OnboardingAnswers = { ...state.answers }
  const trimmed = text.trim()

  // Parse & validate per current step
  switch (state.step) {
    case 'awaiting_email': {
      const email = looksLikeEmail(trimmed)
      if (!email) {
        await sendWhatsAppMessage(
          jid,
          `Hmm, that doesn't look like an email. Try again? e.g. you@example.com`
        )
        return true
      }
      answers.email = email
      break
    }
    case 'awaiting_dob': {
      const dob = parseDob(trimmed)
      if (!dob) {
        await sendWhatsAppMessage(jid, `Couldn't read that date. Try DD/MM/YYYY format.`)
        return true
      }
      answers.dob = dob
      break
    }
    case 'awaiting_goals': {
      if (trimmed.length < 3) {
        await sendWhatsAppMessage(jid, `A sentence or two please — what are you hoping to achieve?`)
        return true
      }
      answers.goals = trimmed
      break
    }
    case 'awaiting_preferences': {
      answers.preferences = /^none$/i.test(trimmed) ? '' : trimmed
      break
    }
    case 'awaiting_schedule': {
      if (trimmed.length < 3) {
        await sendWhatsAppMessage(jid, `Just a quick line on days/times that work for you.`)
        return true
      }
      // Crude split into days vs times — anything not parseable lands in days.
      const lower = trimmed.toLowerCase()
      const timeMatch = lower.match(/(morning|afternoon|evening|night|am|pm|\d{1,2}:?\d{0,2})/)
      if (timeMatch) {
        answers.preferred_times = trimmed
        answers.preferred_days = trimmed
      } else {
        answers.preferred_days = trimmed
        answers.preferred_times = ''
      }
      break
    }
    case 'awaiting_health_conditions': {
      const none = /^none$/i.test(trimmed)
      answers.health_conditions = none ? '' : trimmed
      answers.health_injuries = ''
      answers.health_medications = ''
      break
    }
    case 'awaiting_health_emergency': {
      const ec = parseEmergencyContact(trimmed)
      if (!ec) {
        await sendWhatsAppMessage(
          jid,
          `Need a name + phone. e.g. "Sarah, 07700 900123"`
        )
        return true
      }
      answers.emergency_contact_name = ec.name
      answers.emergency_contact_phone = ec.phone
      break
    }
    case 'awaiting_confirm': {
      if (!isYes(trimmed)) {
        await sendWhatsAppMessage(
          jid,
          `No worries — reply "yes" when you're ready to confirm, or "no" to abandon.`
        )
        return true
      }
      // Finalise: write members fields + health_screenings row.
      await finaliseOnboarding(state.id, state.member_id, state.coach_id, state.track, answers)
      try {
        await sendWhatsAppMessage(jid, promptFor('completed', null, state.track))
      } catch (e) {
        console.error('[onboarding] completion ack send failed:', e)
      }
      return true
    }
    default:
      return false
  }

  // Move to next step
  const next = nextStep(state.step, state.track)
  await saveStep(state.id, next, answers)

  // Look up name once for prompt personalisation
  const { rows: mRows } = await sql`SELECT parent_name FROM members WHERE id = ${state.member_id}`
  const name = (mRows[0]?.parent_name as string | null) || null

  try {
    await sendWhatsAppMessage(jid, promptFor(next, name, state.track))
  } catch (e) {
    console.error('[onboarding] prompt send failed:', e)
  }
  return true
}

async function finaliseOnboarding(
  stateId: string,
  memberId: string,
  coachId: string | null,
  track: OnboardingTrack,
  a: OnboardingAnswers
): Promise<void> {
  // Mirror captured answers onto members
  await sql`
    UPDATE members
    SET email = COALESCE(${a.email ?? null}, email),
        dob = COALESCE(${a.dob ?? null}::date, dob),
        goals = COALESCE(${a.goals ?? null}, goals),
        preferences = COALESCE(${a.preferences ?? null}, preferences),
        preferred_days = COALESCE(${a.preferred_days ?? null}, preferred_days),
        preferred_times = COALESCE(${a.preferred_times ?? null}, preferred_times),
        onboarding_status = 'complete'
    WHERE id = ${memberId}
  `

  // Health screening record (mandatory for PT, optional payload for class)
  await sql`
    INSERT INTO health_screenings (
      member_id, coach_id, screening_type,
      conditions, injuries, medications,
      emergency_contact_name, emergency_contact_phone,
      raw_responses
    )
    VALUES (
      ${memberId}, ${coachId}, ${track},
      ${a.health_conditions ?? null},
      ${a.health_injuries ?? null},
      ${a.health_medications ?? null},
      ${a.emergency_contact_name ?? null},
      ${a.emergency_contact_phone ?? null},
      ${JSON.stringify(a)}::jsonb
    )
  `

  await sql`
    UPDATE onboarding_state SET step = 'completed', updated_at = NOW() WHERE id = ${stateId}
  `
}

// ─── Stalled-onboarding nudge (cron) ───

export async function nudgeStalledOnboarding(): Promise<{ nudged: number; abandoned: number }> {
  let nudged = 0
  let abandoned = 0

  // 24h since last_prompt_at → one gentle nudge (only if we haven't nudged yet).
  // We piggy-back on last_prompt_at: by re-sending the current step's prompt
  // and resetting last_prompt_at, we naturally avoid spamming.
  const { rows: stalled } = await sql`
    SELECT id, member_id, coach_id, member_jid, track, step, answers
    FROM onboarding_state
    WHERE step NOT IN ('completed','abandoned')
      AND last_prompt_at < NOW() - INTERVAL '24 hours'
      AND last_prompt_at > NOW() - INTERVAL '48 hours'
    LIMIT 200
  `
  for (const r of stalled) {
    const { rows: mRows } = await sql`SELECT parent_name FROM members WHERE id = ${r.member_id as string}`
    const name = (mRows[0]?.parent_name as string | null) || null
    const text = `Just nudging you — ${promptFor(r.step as OnboardingStep, name, r.track as OnboardingTrack)}`
    try {
      await sendWhatsAppMessage(r.member_jid as string, text)
      await sql`UPDATE onboarding_state SET last_prompt_at = NOW() WHERE id = ${r.id as string}`
      nudged++
    } catch (e) {
      console.error('[onboarding nudge] send failed:', e)
    }
  }

  // 7 days since last_prompt_at → mark abandoned.
  const { rows: abandonRows } = await sql`
    UPDATE onboarding_state
    SET step = 'abandoned', updated_at = NOW()
    WHERE step NOT IN ('completed','abandoned')
      AND last_prompt_at < NOW() - INTERVAL '7 days'
    RETURNING member_id
  `
  for (const r of abandonRows) {
    await sql`UPDATE members SET onboarding_status = 'stalled' WHERE id = ${r.member_id as string}`
    abandoned++
  }

  return { nudged, abandoned }
}

// Re-export the helper so the trigger endpoint can fetch a member by id
export async function findMemberById(
  memberId: string
): Promise<{ id: string; parent_whatsapp_id: string | null; parent_phone: string | null; programme_id: string } | null> {
  const { rows } = await sql`
    SELECT id, parent_whatsapp_id, parent_phone, programme_id FROM members WHERE id = ${memberId}
  `
  return (
    (rows[0] as
      | { id: string; parent_whatsapp_id: string | null; parent_phone: string | null; programme_id: string }
      | undefined) || null
  )
}
