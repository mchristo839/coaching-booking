// app/lib/notify.ts
// Notification cascade for cancellations and similar events.
// Rule: internal notifications (coach/GM/admin) fire FIRST and succeed
// before any external message goes to the group.

import { sql } from '@vercel/postgres'
import { sendWhatsAppMessage } from '@/app/lib/evolution'
import { logNotification } from '@/app/lib/control-centre-db'

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
    // Build a whatsapp JID from the mobile number if present
    const jid = r.mobile ? `${r.mobile.replace(/\D/g, '')}@s.whatsapp.net` : null
    recipients.push({
      coachId: r.coach_id,
      whatsappJid: jid,
      role: r.role as 'coach' | 'gm' | 'admin',
    })
  }
  return recipients
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
