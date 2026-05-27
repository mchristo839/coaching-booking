// app/lib/payment-chase.ts
// Flow 7 — Payment Chase (Paul's spec).
// Stripe is stubbed for now — this scaffold drives WhatsApp messaging only.
// When Stripe lands, the same ladder fires off failed-payment webhooks
// instead of date-based polling.
//
// Ladder per overdue pt_session (or membership):
//   failed_notice (0h)     "Your payment didn't go through. Here's the link."
//   reminder_24h            quieter nudge
//   reminder_48h            firmer
//   escalation (+7d)        flag to manager (Telegram alert)
//   suspension (+14d)       block further bookings
//
// SERVER-SIDE ONLY.

import { sql } from '@/app/lib/sql'
import { sendWhatsAppMessage } from '@/app/lib/evolution'
import { sendTelegramAlert } from '@/app/lib/alerts'

type ChaseStep = 'failed_notice' | 'reminder_24h' | 'reminder_48h' | 'escalation' | 'suspension'

const STEP_AFTER_HOURS: Record<ChaseStep, number> = {
  failed_notice: 0,
  reminder_24h: 24,
  reminder_48h: 48,
  escalation: 24 * 7,
  suspension: 24 * 14,
}
const STEP_ORDER: ChaseStep[] = ['failed_notice', 'reminder_24h', 'reminder_48h', 'escalation', 'suspension']

function messageFor(step: ChaseStep, ctx: {
  firstName: string | null
  amount: number | null
  itemLabel: string
  paymentLink: string | null
}): string {
  const name = ctx.firstName ? ` ${ctx.firstName}` : ''
  const amount = ctx.amount != null ? `£${ctx.amount.toFixed(2)}` : 'the balance'
  const link = ctx.paymentLink ? `\n${ctx.paymentLink}` : ''
  switch (step) {
    case 'failed_notice':
      return `Hey${name} — just a heads up that ${amount} for ${ctx.itemLabel} hasn't been received. Updated link:${link}\n\nAny issues, just let me know.`
    case 'reminder_24h':
      return `Quick reminder${name} — ${amount} for ${ctx.itemLabel} is still outstanding.${link}`
    case 'reminder_48h':
      return `Hey${name} — the studio is chasing the ${amount} for ${ctx.itemLabel}. Can you settle that today?${link}`
    case 'escalation':
      return `Hi${name} — the studio team will be in touch directly about ${ctx.itemLabel}. We want to get this sorted.`
    case 'suspension':
      return `Hi${name} — to fairly manage outstanding balances, your booking access has been paused. Get in touch when you'd like to clear ${amount} for ${ctx.itemLabel} and we'll restore it straight away.`
  }
}

interface PtRow {
  target_id: string
  member_id: string
  parent_name: string | null
  parent_whatsapp_id: string | null
  parent_phone: string | null
  amount: string | null
  session_date: string
  hours_since_due: number
  last_step: ChaseStep | null
  last_step_at: string | null
  payment_link: string | null
}

function jidFromRow(row: Pick<PtRow, 'parent_whatsapp_id' | 'parent_phone'>): string | null {
  if (row.parent_whatsapp_id) {
    return row.parent_whatsapp_id.includes('@')
      ? row.parent_whatsapp_id
      : `${row.parent_whatsapp_id.replace(/\D/g, '')}@s.whatsapp.net`
  }
  if (row.parent_phone) {
    const d = row.parent_phone.replace(/\D/g, '')
    if (!d) return null
    const normalized = d.startsWith('07') ? '44' + d.slice(1) : d.startsWith('0044') ? d.slice(2) : d
    return `${normalized}@s.whatsapp.net`
  }
  return null
}

export interface PaymentChaseRunResult {
  scanned: number
  fired: number
  details: Array<{ targetId: string; step: ChaseStep; sent: boolean; error?: string }>
}

export async function runPaymentChase(): Promise<PaymentChaseRunResult> {
  // PT sessions with payment_status='pending' past their session_date.
  // (Future: extend to memberships expired without renewal payment.)
  const { rows } = await sql`
    SELECT
      s.id as target_id,
      s.member_id,
      m.parent_name, m.parent_whatsapp_id, m.parent_phone,
      s.price_gbp::text as amount,
      s.session_date::text as session_date,
      EXTRACT(EPOCH FROM (NOW() - s.session_date::timestamp)) / 3600 as hours_since_due,
      pcl.last_step,
      pcl.last_step_at::text as last_step_at,
      (
        SELECT pr.payment_link FROM promotions pr
        JOIN promotion_targets pgt ON pgt.promotion_id = pr.id
        JOIN programmes prg ON prg.id = pgt.programme_id
        WHERE prg.coach_id = s.coach_id AND pr.payment_link IS NOT NULL
        ORDER BY pr.created_at DESC LIMIT 1
      ) as payment_link
    FROM pt_sessions s
    JOIN members m ON m.id = s.member_id
    LEFT JOIN payment_chase_log pcl ON pcl.target_type = 'pt_session' AND pcl.target_id = s.id
    WHERE s.status IN ('booked','completed')
      AND s.payment_status = 'pending'
      AND s.session_date <= CURRENT_DATE
      AND (pcl.resolved_at IS NULL)
  `

  const result: PaymentChaseRunResult = { scanned: rows.length, fired: 0, details: [] }

  for (const row of rows as unknown as PtRow[]) {
    // Pick the next step we haven't fired yet whose required-hours-elapsed window we've hit
    const lastIdx = row.last_step ? STEP_ORDER.indexOf(row.last_step) : -1
    let nextStep: ChaseStep | null = null
    for (let i = lastIdx + 1; i < STEP_ORDER.length; i++) {
      if (row.hours_since_due >= STEP_AFTER_HOURS[STEP_ORDER[i]]) nextStep = STEP_ORDER[i]
      else break
    }
    if (!nextStep) continue

    const jid = jidFromRow(row)
    const firstName = (row.parent_name || '').split(/\s+/)[0] || null
    const amount = row.amount ? Number(row.amount) : null

    // Escalation step also pings the manager via Telegram (no member WA send)
    if (nextStep === 'escalation') {
      try {
        await sendTelegramAlert(
          `pay_overdue_escalation_${row.target_id}`,
          `💷 Payment overdue — needs manager\nMember ${row.parent_name || row.member_id} hasn't paid for session ${row.target_id} (${amount ? '£' + amount.toFixed(2) : '?'}, due ${row.session_date}). 7d since due.`,
          'warn'
        )
        await sql`
          INSERT INTO payment_chase_log (target_type, target_id, member_id, last_step, last_step_at)
          VALUES ('pt_session', ${row.target_id}, ${row.member_id}, ${nextStep}, NOW())
          ON CONFLICT (target_type, target_id) DO UPDATE
            SET last_step = EXCLUDED.last_step, last_step_at = NOW(), updated_at = NOW()
        `
        result.fired++
        result.details.push({ targetId: row.target_id, step: nextStep, sent: true })
      } catch (e) {
        result.details.push({ targetId: row.target_id, step: nextStep, sent: false, error: String(e) })
      }
      continue
    }

    // Suspension step also disables booking access by setting member.status='suspended'
    if (nextStep === 'suspension') {
      try {
        await sql`UPDATE members SET status = 'suspended', updated_at = NOW() WHERE id = ${row.member_id}`
      } catch (e) {
        console.error('[payment-chase suspension] status update failed:', e)
      }
    }

    if (!jid) {
      result.details.push({ targetId: row.target_id, step: nextStep, sent: false, error: 'no_jid' })
      continue
    }

    const msg = messageFor(nextStep, {
      firstName,
      amount,
      itemLabel: `your session on ${new Date(row.session_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
      paymentLink: row.payment_link,
    })
    try {
      await sendWhatsAppMessage(jid, msg)
      await sql`
        INSERT INTO payment_chase_log (target_type, target_id, member_id, last_step, last_step_at)
        VALUES ('pt_session', ${row.target_id}, ${row.member_id}, ${nextStep}, NOW())
        ON CONFLICT (target_type, target_id) DO UPDATE
          SET last_step = EXCLUDED.last_step, last_step_at = NOW(), updated_at = NOW()
      `
      result.fired++
      result.details.push({ targetId: row.target_id, step: nextStep, sent: true })
    } catch (e) {
      result.details.push({ targetId: row.target_id, step: nextStep, sent: false, error: String(e) })
    }
  }
  return result
}
