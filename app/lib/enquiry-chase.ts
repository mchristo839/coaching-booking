// app/lib/enquiry-chase.ts
// Flow 4 — New Enquiry Chase Sequence (Paul's spec).
//
// Unknown contact messages the bot → we create a prospects row in
// 'enquiry_new' and send Step 1 (welcome + qualify) immediately. The
// daily cron progresses the ladder: +2h soft nudge, +24h value-add,
// +3d social proof, +7d last chance, +30d reactivation.
//
// "Reply at any point" stops the automation: prospect.status = 'replied',
// the bot enters conversational fallback mode and the studio manager
// sees it in the Inbox panel.
//
// SERVER-SIDE ONLY.

import { sql } from '@/app/lib/sql'
import { sendWhatsAppMessage } from '@/app/lib/evolution'

const OPT_OUT_PATTERN = /\b(stop|unsubscribe|not interested|leave me alone|don[''']?t message)\b/i

export interface ProspectRow {
  id: string
  jid: string
  phone: string | null
  name: string | null
  intent_text: string | null
  status: 'enquiry_new' | 'replied' | 'trial_booked' | 'converted' | 'opted_out' | 'lapsed'
  chase_step: number
  last_step_at: string
  source: string
}

// Steps (matches Paul's spec):
//   1 — T+0 instant welcome + qualify
//   2 — +2h soft nudge if no reply
//   3 — +24h value-add (trial offer)
//   4 — +3d social proof
//   5 — +7d last chance
//   6 — +30d reactivation
const STEP_DELAY_HOURS: Record<number, number> = {
  2: 2,
  3: 24,
  4: 72,
  5: 168,
  6: 720,
}

// ─── Business hours guard ───
// Don't fire chase steps outside 08:00–20:00 local OR on Sundays.
// Caller passes the studio's timezone; we default to UTC (close enough
// for British studios; tweak later if multi-tz needed).
function isBusinessHoursNow(): boolean {
  const now = new Date()
  const day = now.getUTCDay()  // 0=Sun
  if (day === 0) return false
  const hour = now.getUTCHours()
  return hour >= 8 && hour < 20
}

// ─── Lookups ───

export async function findProspectByJid(jid: string): Promise<ProspectRow | null> {
  const { rows } = await sql`
    SELECT id, jid, phone, name, intent_text, status, chase_step,
           last_step_at::text as last_step_at, source
    FROM prospects WHERE jid = ${jid} LIMIT 1
  `
  return (rows[0] as ProspectRow | undefined) || null
}

async function createProspect(jid: string, phone: string | null, intentText: string): Promise<string> {
  const { rows } = await sql`
    INSERT INTO prospects (jid, phone, intent_text, status, chase_step, last_step_at)
    VALUES (${jid}, ${phone}, ${intentText.slice(0, 500)}, 'enquiry_new', 1, NOW())
    ON CONFLICT (jid) DO UPDATE
      SET intent_text = COALESCE(prospects.intent_text, EXCLUDED.intent_text),
          updated_at = NOW()
    RETURNING id
  `
  return rows[0].id as string
}

async function markProspect(id: string, fields: { status?: ProspectRow['status']; chase_step?: number; name?: string }) {
  const updates: Promise<unknown>[] = []
  if (fields.status !== undefined) {
    updates.push(sql`UPDATE prospects SET status = ${fields.status}, updated_at = NOW() WHERE id = ${id}`)
  }
  if (fields.chase_step !== undefined) {
    updates.push(sql`UPDATE prospects SET chase_step = ${fields.chase_step}, last_step_at = NOW(), updated_at = NOW() WHERE id = ${id}`)
  }
  if (fields.name !== undefined) {
    updates.push(sql`UPDATE prospects SET name = ${fields.name}, updated_at = NOW() WHERE id = ${id}`)
  }
  await Promise.all(updates)
}

// ─── Message builders ───

function buildStepMessage(step: number, name: string | null): string {
  const greeting = name ? `Hi ${name}` : 'Hey'
  switch (step) {
    case 1:
      return `${greeting} 👋 thanks for getting in touch! I'm the studio assistant — I can help you find the right session, book a trial, or answer any questions.\n\nWhat are you looking for?\n1️⃣ Personal training\n2️⃣ Group classes\n3️⃣ Membership info\n4️⃣ Something else`
    case 2:
      return `Just checking back — happy to answer any questions or get you booked in for a trial whenever you're ready 💪`
    case 3:
      return `Quick heads up — we've got trial slots open this week. Completely free, no commitment. Want me to find one that fits?`
    case 4:
      return `Lots of new faces at the studio this month. If you'd like to come in and see what it's about, the door's open — just reply "trial".`
    case 5:
      return `Last note from me unless you want to pick this up — message anytime if you ever want to give the studio a try 👍`
    case 6:
      return `Hi again — bit of time has passed and the studio's grown a fair bit. If you'd like a fresh trial, just say the word.`
    default:
      return `${greeting} 👋`
  }
}

// ─── Webhook entry point ───
// Returns true when this branch claimed the message.
// Should be wired AT THE END of the 1:1 branches (after camp / pt / cancellation
// / feedback) — only matches when the sender is NOT a known member or coach.

export async function tryHandleEnquiryMessage(jid: string, text: string, senderName?: string | null): Promise<boolean> {
  // Check if sender is already a known prospect
  let prospect = await findProspectByJid(jid)

  // Check if sender is a known member (don't enrol members as prospects)
  // We also avoid enrolling coaches; both checks lean on the inbox-agent
  // identity resolution path. Cheap: just look up both tables directly.
  if (!prospect) {
    const digits = jid.replace(/@.*$/, '').replace(/\D/g, '')
    const { rows: memberRows } = await sql`
      SELECT 1 FROM members
      WHERE parent_whatsapp_id = ${jid}
         OR parent_whatsapp_id = ${digits}
         OR regexp_replace(COALESCE(parent_phone, ''), '\\D', '', 'g') = ${digits}
      LIMIT 1
    `
    if (memberRows[0]) return false  // known member — let standard flow handle
    const { rows: coachRows } = await sql`
      SELECT 1 FROM coaches_v2
      WHERE regexp_replace(COALESCE(mobile, ''), '\\D', '', 'g') = ${digits} LIMIT 1
    `
    if (coachRows[0]) return false  // known coach

    // Don't hijack a camp parent: if they have a recent camp booking — matched by
    // phone digits OR by a name match on a group-@lid booking (the case the camp
    // flow couldn't re-link) — never enrol them as a studio prospect / send the
    // generic menu. Stay out and let the (silent) standard fallback handle it.
    const first = (senderName || '').trim().split(/\s+/)[0].toLowerCase()
    const { rows: campRows } = await sql`
      SELECT 1 FROM camp_bookings
      WHERE state NOT IN ('cancelled','expired')
        AND created_at > NOW() - INTERVAL '72 hours'
        AND (
          regexp_replace(split_part(split_part(parent_jid,'@',1),':',1),'\\D','','g') = ${digits}
          OR (${first} <> '' AND lower(split_part(COALESCE(parent_name,''),' ',1)) = ${first})
        )
      LIMIT 1
    `
    if (campRows[0]) return false  // camp parent — not a studio enquiry
  }

  // Opt-out at any point stops the ladder
  if (OPT_OUT_PATTERN.test(text)) {
    if (prospect) {
      await markProspect(prospect.id, { status: 'opted_out' })
      await sendWhatsAppMessage(jid, 'No problem — I won\'t message again. If you ever change your mind, just text us here.')
    }
    return true
  }

  // First contact: create + send Step 1
  if (!prospect) {
    const phone = jid.replace(/@.*$/, '').replace(/\D/g, '') || null
    const id = await createProspect(jid, phone, text)
    try {
      await sendWhatsAppMessage(jid, buildStepMessage(1, null))
    } catch (e) {
      console.error('[enquiry chase] step 1 send failed:', e)
    }
    prospect = { id, jid, phone, name: null, intent_text: text, status: 'enquiry_new', chase_step: 1, last_step_at: new Date().toISOString(), source: 'whatsapp' }
    return true
  }

  // Reply received → stop the ladder, let standard fallback handle this message
  if (prospect.status === 'enquiry_new') {
    await markProspect(prospect.id, { status: 'replied' })
    // Capture a name if the prospect looks like they're answering "what's your name"
    // — kept simple here; richer extraction can come later.
    if (text.length < 60 && /^[A-Z][a-z]+/.test(text)) {
      await markProspect(prospect.id, { name: text.trim().slice(0, 80) })
    }
    // Return false so the standard webhook continues to handle the reply
    // (escalate-to-manager or whatever the existing logic does for unknown
    // senders). The Inbox Agent will log it.
    return false
  }

  // For prospects already in 'replied' / other states, we don't re-claim.
  return false
}

// ─── Cron entry point ───
// Progress the chase ladder. Fires the next step for each eligible prospect.

export interface ChaseRunResult {
  scanned: number
  fired: number
  details: Array<{ jid: string; step: number; sent: boolean; error?: string }>
}

export async function runEnquiryChaseLadder(): Promise<ChaseRunResult> {
  if (!isBusinessHoursNow()) {
    // Don't fire outside business hours — defer to next run
    return { scanned: 0, fired: 0, details: [] }
  }

  const { rows } = await sql`
    SELECT id, jid, phone, name, status, chase_step,
           last_step_at::text as last_step_at,
           EXTRACT(EPOCH FROM (NOW() - last_step_at)) / 3600 as hours_since_step
    FROM prospects
    WHERE status = 'enquiry_new'
      AND chase_step < 6
    ORDER BY last_step_at ASC
    LIMIT 100
  `

  const result: ChaseRunResult = { scanned: rows.length, fired: 0, details: [] }

  for (const row of rows as Array<{
    id: string
    jid: string
    name: string | null
    chase_step: number
    hours_since_step: number
  }>) {
    const nextStep = row.chase_step + 1
    const requiredDelay = STEP_DELAY_HOURS[nextStep] ?? 999
    if (row.hours_since_step < requiredDelay) continue

    try {
      await sendWhatsAppMessage(row.jid, buildStepMessage(nextStep, row.name))
      await markProspect(row.id, { chase_step: nextStep })
      result.fired++
      result.details.push({ jid: row.jid, step: nextStep, sent: true })

      // After step 6 (T+30d) mark as lapsed so we stop touching them
      if (nextStep >= 6) {
        await markProspect(row.id, { status: 'lapsed' })
      }
    } catch (e) {
      result.details.push({ jid: row.jid, step: nextStep, sent: false, error: String(e) })
    }
  }
  return result
}
