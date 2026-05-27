// app/lib/lifecycle-crons.ts
// Lifecycle nudges run by daily Contabo cron:
//   - Flow 8: lapsed client re-engagement (14d / 21d / 30d / 45d / 90d)
//   - Flow 11: membership renewal (-7d / -3d / 0d / +3d grace)
//
// Both are stateless idempotent loops — they look at the current data and
// fire the right step. Re-running on the same day is safe because each
// step only fires once per member (last_step tracking + uniqueness).
//
// SERVER-SIDE ONLY.

import { sql } from '@/app/lib/sql'
import { sendWhatsAppMessage } from '@/app/lib/evolution'

interface MemberContact {
  member_id: string
  member_jid: string | null
  member_first_name: string | null
  coach_id: string | null
  coach_first_name: string | null
}

function jidFromMemberRow(row: { parent_whatsapp_id: string | null; parent_phone: string | null }): string | null {
  if (row.parent_whatsapp_id) {
    return row.parent_whatsapp_id.includes('@')
      ? row.parent_whatsapp_id
      : `${row.parent_whatsapp_id.replace(/\D/g, '')}@s.whatsapp.net`
  }
  if (row.parent_phone) {
    const d = row.parent_phone.replace(/\D/g, '')
    if (!d) return null
    // Normalise UK 07... → 447...
    const normalized = d.startsWith('07') ? '44' + d.slice(1) : d.startsWith('0044') ? d.slice(2) : d
    return `${normalized}@s.whatsapp.net`
  }
  return null
}

// ─── Flow 8 — Lapsed client re-engagement ───

type LapsedStep = 'day_14' | 'day_21' | 'day_30' | 'day_45' | 'day_90'

const LAPSED_DAY_BUCKETS: Array<{ step: LapsedStep; minDays: number; maxDays: number }> = [
  { step: 'day_14', minDays: 14, maxDays: 20 },
  { step: 'day_21', minDays: 21, maxDays: 29 },
  { step: 'day_30', minDays: 30, maxDays: 44 },
  { step: 'day_45', minDays: 45, maxDays: 89 },
  { step: 'day_90', minDays: 90, maxDays: 365 },
]

function lapsedMessageFor(step: LapsedStep, name: string, coachName: string | null): string {
  const greeting = name ? `Hey ${name}` : 'Hey there'
  switch (step) {
    case 'day_14':
      return `${greeting} — haven't seen you at the studio in a couple of weeks. Everything ok? If you want to get back in, just say the word and I'll find you a slot 💪`
    case 'day_21':
      return `${greeting} — three weeks since your last session. Want me to book you in${coachName ? ' with ' + coachName : ''}? Reply "book" and I'll show you what's available.`
    case 'day_30':
      return `${greeting} — we miss you at the studio. Your next session is on us — first one back is free. Reply "book" if you'd like to come back in.`
    case 'day_45':
      return `${greeting} — last note from me unless you'd like to pick this up. The door is always open. Hope to see you again at the studio 🏋️`
    case 'day_90':
      return `${greeting} — bit of time has passed. We've had some changes at the studio you might like. If you want to come and see what's new, reply "book" any time.`
  }
}

export interface LapsedRunResult {
  scanned: number
  fired: number
  details: Array<{ memberId: string; step: LapsedStep; sent: boolean; error?: string }>
}

export async function runLapsedReEngagement(): Promise<LapsedRunResult> {
  // Find active members with no booking in 14+ days, not opted-out.
  const { rows: candidates } = await sql`
    SELECT m.id as member_id,
           m.parent_name, m.parent_whatsapp_id, m.parent_phone,
           p.coach_id, c.first_name as coach_first_name,
           COALESCE(
             (SELECT MAX(session_date) FROM pt_sessions WHERE member_id = m.id AND status IN ('completed','booked')),
             m.joined_at::date
           ) as last_active,
           l.last_step as last_step,
           l.status as lapsed_status
    FROM members m
    LEFT JOIN programmes p ON p.id = m.programme_id
    LEFT JOIN coaches_v2 c ON c.id = p.coach_id
    LEFT JOIN lapsed_reengagement_log l ON l.member_id = m.id
    WHERE m.status = 'active'
      AND (l.status IS NULL OR l.status = 'in_progress')
  `

  const result: LapsedRunResult = { scanned: candidates.length, fired: 0, details: [] }

  for (const row of candidates as Array<{
    member_id: string
    parent_name: string | null
    parent_whatsapp_id: string | null
    parent_phone: string | null
    coach_id: string | null
    coach_first_name: string | null
    last_active: string | null
    last_step: LapsedStep | null
    lapsed_status: string | null
  }>) {
    if (!row.last_active) continue
    const daysSince = Math.floor((Date.now() - new Date(row.last_active).getTime()) / (24 * 3600 * 1000))
    const bucket = LAPSED_DAY_BUCKETS.find((b) => daysSince >= b.minDays && daysSince <= b.maxDays)
    if (!bucket) continue
    if (row.last_step === bucket.step) continue  // already fired this step

    const jid = jidFromMemberRow(row)
    if (!jid) {
      result.details.push({ memberId: row.member_id, step: bucket.step, sent: false, error: 'no_jid' })
      continue
    }
    const firstName = (row.parent_name || '').split(/\s+/)[0]
    const message = lapsedMessageFor(bucket.step, firstName, row.coach_first_name)

    try {
      await sendWhatsAppMessage(jid, message)
      await sql`
        INSERT INTO lapsed_reengagement_log (member_id, coach_id, last_step, last_step_at, last_session_at, status)
        VALUES (${row.member_id}, ${row.coach_id}, ${bucket.step}, NOW(), ${row.last_active}, 'in_progress')
        ON CONFLICT (member_id) DO UPDATE
          SET last_step = EXCLUDED.last_step,
              last_step_at = NOW(),
              last_session_at = EXCLUDED.last_session_at,
              status = 'in_progress',
              updated_at = NOW()
      `
      result.fired++
      result.details.push({ memberId: row.member_id, step: bucket.step, sent: true })
    } catch (e) {
      result.details.push({ memberId: row.member_id, step: bucket.step, sent: false, error: String(e) })
    }
  }
  return result
}

// ─── Flow 11 — Membership renewal ───

type RenewalStep = 'reminder_7d' | 'reminder_3d' | 'expiry_day' | 'grace_3d'

interface RenewalRow {
  membership_id: string
  member_id: string
  member_first_name: string | null
  jid_raw: string | null
  jid_phone: string | null
  coach_id: string | null
  plan_name: string | null
  expires_at: string
  status: string
  last_renewal_step: RenewalStep | null
}

function renewalStepFor(expiresAt: string): RenewalStep | null {
  const expiry = new Date(expiresAt + 'T00:00:00')
  const now = new Date()
  const diffDays = Math.floor((expiry.getTime() - now.getTime()) / (24 * 3600 * 1000))
  if (diffDays === 7) return 'reminder_7d'
  if (diffDays === 3) return 'reminder_3d'
  if (diffDays === 0) return 'expiry_day'
  if (diffDays === -3) return 'grace_3d'
  return null
}

function renewalMessageFor(step: RenewalStep, name: string, planName: string | null, expiresAt: string): string {
  const greeting = name ? `Hey ${name}` : 'Hey there'
  const plan = planName ? ` ${planName}` : ''
  const expiryStr = new Date(expiresAt + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  switch (step) {
    case 'reminder_7d':
      return `${greeting} — your${plan} membership renews on ${expiryStr}. All your sessions will continue as normal if your card is up to date. Need to update anything? Just let me know.`
    case 'reminder_3d':
      return `${greeting} — quick heads up that your${plan} membership renews in 3 days (${expiryStr}). Reply "renew" or settle via the studio's usual payment link.`
    case 'expiry_day':
      return `${greeting} — your${plan} membership expired today. You've got a 3-day grace period to renew without interruption.`
    case 'grace_3d':
      return `${greeting} — your${plan} membership has lapsed. We'd love to have you back when the time's right.`
  }
}

export interface RenewalRunResult {
  scanned: number
  fired: number
  details: Array<{ membershipId: string; step: RenewalStep; sent: boolean; error?: string }>
}

export async function runMembershipRenewalReminders(): Promise<RenewalRunResult> {
  const { rows } = await sql`
    SELECT ms.id as membership_id, ms.member_id,
           m.parent_name as member_first_name,
           m.parent_whatsapp_id as jid_raw,
           m.parent_phone as jid_phone,
           ms.coach_id, ms.plan_name,
           ms.expires_at::text as expires_at,
           ms.status, ms.last_renewal_step
    FROM memberships ms
    JOIN members m ON m.id = ms.member_id
    WHERE ms.status IN ('active','grace_period')
      AND ms.expires_at BETWEEN CURRENT_DATE - INTERVAL '4 days' AND CURRENT_DATE + INTERVAL '8 days'
  `

  const result: RenewalRunResult = { scanned: rows.length, fired: 0, details: [] }

  for (const row of rows as unknown as RenewalRow[]) {
    const step = renewalStepFor(row.expires_at)
    if (!step) continue
    if (row.last_renewal_step === step) continue

    const jid = jidFromMemberRow({ parent_whatsapp_id: row.jid_raw, parent_phone: row.jid_phone })
    if (!jid) {
      result.details.push({ membershipId: row.membership_id, step, sent: false, error: 'no_jid' })
      continue
    }
    const firstName = (row.member_first_name || '').split(/\s+/)[0]
    const message = renewalMessageFor(step, firstName, row.plan_name, row.expires_at)

    try {
      await sendWhatsAppMessage(jid, message)
      // Step-based status transition: expiry_day → grace_period, grace_3d → lapsed
      const newStatus = step === 'grace_3d' ? 'lapsed' : step === 'expiry_day' ? 'grace_period' : row.status
      await sql`
        UPDATE memberships
        SET last_renewal_step = ${step},
            last_renewal_at = NOW(),
            status = ${newStatus},
            updated_at = NOW()
        WHERE id = ${row.membership_id}
      `
      result.fired++
      result.details.push({ membershipId: row.membership_id, step, sent: true })
    } catch (e) {
      result.details.push({ membershipId: row.membership_id, step, sent: false, error: String(e) })
    }
  }
  return result
}
