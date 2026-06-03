// app/lib/notify.ts
// Notification cascade for cancellations and similar events.
// Rule: internal notifications (coach/GM/admin) fire FIRST and succeed
// before any external message goes to the group.

import { sql } from '@/app/lib/sql'
import { sendWhatsAppMessage } from '@/app/lib/evolution'
import { logNotification } from '@/app/lib/control-centre-db'
import { normalizeUkPhoneToJid } from '@/app/lib/feedback'

interface InternalRecipient {
  coachId: string
  whatsappJid: string | null
  role: 'coach' | 'gm' | 'admin'
}

/**
 * Find everyone who should receive an internal notification about a programme event:
 * - The programme's owner coach
 * - Any additional coaches assigned to the programme
 * - The provider's GMs and admins
 * Deduplicates by coach_id.
 */
export async function getInternalRecipients(
  programmeId: string,
  excludeCoachId?: string
): Promise<InternalRecipient[]> {
  const { rows } = await sql`
    SELECT DISTINCT c.id as coach_id, c.mobile, 'coach'::text as role
    FROM programmes p
    JOIN coaches_v2 c ON c.id = p.coach_id
    WHERE p.id = ${programmeId}

    UNION

    SELECT DISTINCT c.id as coach_id, c.mobile, 'coach'::text as role
    FROM programme_assignments pa
    JOIN coaches_v2 c ON c.id = pa.coach_id
    WHERE pa.programme_id = ${programmeId}

    UNION

    SELECT DISTINCT c.id as coach_id, c.mobile,
      CASE ps.role WHEN 'gm' THEN 'gm'::text ELSE 'admin'::text END as role
    FROM programmes p
    JOIN coaches_v2 pc ON pc.id = p.coach_id
    JOIN provider_staff ps ON ps.provider_id = pc.provider_id
    JOIN coaches_v2 c ON c.id = ps.coach_id
    WHERE p.id = ${programmeId}
  `

  const seen = new Set<string>()
  const recipients: InternalRecipient[] = []
  for (const r of rows) {
    if (seen.has(r.coach_id)) continue
    if (excludeCoachId && r.coach_id === excludeCoachId) continue
    seen.add(r.coach_id)
    // Build a whatsapp JID from the mobile number if present. Must be the
    // INTERNATIONAL form — UK coaches store local "07…" numbers, and
    // "07…@s.whatsapp.net" doesn't exist on WhatsApp (Evolution 400s). The
    // normaliser converts 07…→447…, 0044…→44…, etc.
    const digits = r.mobile ? r.mobile.replace(/\D/g, '') : ''
    const jid = digits ? normalizeUkPhoneToJid(r.mobile) : null
    recipients.push({
      coachId: r.coach_id,
      whatsappJid: jid,
      role: r.role as 'coach' | 'gm' | 'admin',
    })
  }
  return recipients
}

// Real handoff for the closed-intent bot. When the bot refuses-and-routes
// (out-of-scope, or in-scope but missing data) it must not be a dead end: the
// owning coach/GM/admin get a WhatsApp DM with the parent's question so they
// can follow up. Best-effort — every send is logged; the caller wraps this so
// a notification failure can never break the bot's group reply.
export async function notifyCoachHandoff(input: {
  programmeId: string
  parentName: string
  question: string
  reason: 'out_of_scope' | 'missing_data'
}): Promise<{ notified: number; failed: number }> {
  const recipients = await getInternalRecipients(input.programmeId)
  const why =
    input.reason === 'missing_data'
      ? "needs information the bot doesn't have on file"
      : "asked something outside what the bot can answer"
  const message =
    `🔔 A parent in your WhatsApp group ${why}, so I've passed it to you.\n\n` +
    `From: ${input.parentName || 'a parent'}\n` +
    `They asked: "${input.question}"\n\n` +
    `I've told them you'll come back to them directly.`

  let notified = 0
  let failed = 0
  for (const r of recipients) {
    if (!r.whatsappJid) {
      await logNotification({
        eventType: 'bot_handoff_internal',
        programmeId: input.programmeId,
        recipientType: r.role,
        status: 'failed',
        error: 'No phone number on record',
      })
      failed++
      continue
    }
    try {
      await sendWhatsAppMessage(r.whatsappJid, message)
      await logNotification({
        eventType: 'bot_handoff_internal',
        programmeId: input.programmeId,
        recipientType: r.role,
        recipientJid: r.whatsappJid,
        status: 'sent',
      })
      notified++
    } catch (err) {
      await logNotification({
        eventType: 'bot_handoff_internal',
        programmeId: input.programmeId,
        recipientType: r.role,
        recipientJid: r.whatsappJid,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      })
      failed++
    }
  }
  return { notified, failed }
}

interface CascadeInput {
  programmeId: string
  groupJid: string | null
  triggerCoachId: string
  eventType: string
  internalMessage: string
  externalMessage: string
}

export interface CascadeResult {
  internalSent: number
  internalFailed: number
  externalSent: boolean
  externalError: string | null
  blocked: boolean
  errors: string[]
}

/**
 * Run the internal-first, external-second cascade.
 * If ANY internal send fails, the external is blocked.
 */
export async function notifyCascade(input: CascadeInput): Promise<CascadeResult> {
  const result: CascadeResult = {
    internalSent: 0,
    internalFailed: 0,
    externalSent: false,
    externalError: null,
    blocked: false,
    errors: [],
  }

  const recipients = await getInternalRecipients(input.programmeId, input.triggerCoachId)

  for (const recipient of recipients) {
    if (!recipient.whatsappJid) {
      // Can't notify without a phone number — count as failed
      await logNotification({
        eventType: `${input.eventType}_internal`,
        triggerUser: input.triggerCoachId,
        programmeId: input.programmeId,
        recipientType: recipient.role,
        status: 'failed',
        error: 'No phone number on record',
      })
      result.internalFailed++
      result.errors.push(`${recipient.role} has no phone number`)
      continue
    }

    try {
      await sendWhatsAppMessage(recipient.whatsappJid, input.internalMessage)
      await logNotification({
        eventType: `${input.eventType}_internal`,
        triggerUser: input.triggerCoachId,
        programmeId: input.programmeId,
        recipientType: recipient.role,
        recipientJid: recipient.whatsappJid,
        status: 'sent',
      })
      result.internalSent++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await logNotification({
        eventType: `${input.eventType}_internal`,
        triggerUser: input.triggerCoachId,
        programmeId: input.programmeId,
        recipientType: recipient.role,
        recipientJid: recipient.whatsappJid,
        status: 'failed',
        error: msg,
      })
      result.internalFailed++
      result.errors.push(`${recipient.role}: ${msg}`)
    }
  }

  // Only send external if ALL internal sends succeeded (or there were none required)
  // Note: if there are no internal recipients (solo coach), we proceed to external
  if (result.internalFailed > 0) {
    result.blocked = true
    console.warn(
      `[NOTIFY] External blocked for ${input.eventType} — ${result.internalFailed} internal sends failed`
    )
    return result
  }

  if (input.groupJid) {
    try {
      await sendWhatsAppMessage(input.groupJid, input.externalMessage)
      await logNotification({
        eventType: `${input.eventType}_external`,
        triggerUser: input.triggerCoachId,
        programmeId: input.programmeId,
        recipientType: 'group',
        recipientJid: input.groupJid,
        status: 'sent',
      })
      result.externalSent = true
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await logNotification({
        eventType: `${input.eventType}_external`,
        triggerUser: input.triggerCoachId,
        programmeId: input.programmeId,
        recipientType: 'group',
        recipientJid: input.groupJid,
        status: 'failed',
        error: msg,
      })
      result.externalError = msg
    }
  }

  return result
}
