// app/lib/inbox-agent.ts
// The Inbox Agent (Paul's spec): orchestration layer above every flow.
// Per spec it does identity resolution → intent classification → routing.
//
// This Phase-2 cut implements observability + classification. Identity
// resolution + log-every-message both run on every inbound 1:1 message
// from the webhook. Routing decisions are still made by the existing
// branch order in the webhook handler (camp → pt → feedback → group);
// the Inbox Agent's classifier is logged alongside so we can compare
// "what the LLM thought" vs "what we did" and tighten routing in a
// later iteration.
//
// SERVER-SIDE ONLY.

import { sql } from '@/app/lib/sql'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
const MODEL = 'claude-haiku-4-5-20251001'

export type Intent =
  | 'booking_request'
  | 'class_enquiry'
  | 'cancellation'
  | 'payment_query'
  | 'rescheduling'
  | 'feedback_complaint'
  | 'referral_interest'
  | 'faq_general'
  | 'membership_query'
  | 'pt_availability'
  | 'social'
  | 'unclassifiable'

export type Sentiment = 'positive' | 'neutral' | 'negative'

export type SenderType = 'member' | 'coach' | 'unknown'

export interface SenderContext {
  type: SenderType
  jid: string
  record_id: string | null
  display_name: string | null
  coach_id: string | null        // member's programme coach OR the coach's own id
  programme_id: string | null
}

// ─── Identity resolution ───
// Same lookup paths used elsewhere in the codebase, consolidated here so the
// agent has one entry point. Members match by parent_whatsapp_id / parent_phone
// (digits-only); coaches by mobile.

export async function resolveSender(jid: string): Promise<SenderContext> {
  const digits = jid.replace(/@.*$/, '').replace(/\D/g, '')

  // Try member first (most common case)
  const { rows: memberRows } = await sql`
    SELECT m.id, m.parent_name, m.programme_id, p.coach_id
    FROM members m
    LEFT JOIN programmes p ON p.id = m.programme_id
    WHERE m.parent_whatsapp_id = ${jid}
       OR m.parent_whatsapp_id = ${digits}
       OR regexp_replace(COALESCE(m.parent_phone, ''), '\\D', '', 'g') = ${digits}
    LIMIT 1
  `
  if (memberRows[0]) {
    const m = memberRows[0]
    return {
      type: 'member',
      jid,
      record_id: m.id as string,
      display_name: (m.parent_name as string | null) || null,
      coach_id: (m.coach_id as string | null) || null,
      programme_id: (m.programme_id as string | null) || null,
    }
  }

  // Try coach
  const { rows: coachRows } = await sql`
    SELECT id, first_name, last_name
    FROM coaches_v2
    WHERE regexp_replace(COALESCE(mobile, ''), '\\D', '', 'g') = ${digits}
    LIMIT 1
  `
  if (coachRows[0]) {
    const c = coachRows[0]
    return {
      type: 'coach',
      jid,
      record_id: c.id as string,
      display_name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || null,
      coach_id: c.id as string,
      programme_id: null,
    }
  }

  return {
    type: 'unknown',
    jid,
    record_id: null,
    display_name: null,
    coach_id: null,
    programme_id: null,
  }
}

// ─── Intent classification ───
// One Claude call per inbound message. Returns intent + sentiment + confidence.
// Falls back to 'unclassifiable' + 'neutral' + 0 if the LLM is unavailable —
// safe default that lets the legacy branches still route.

export interface ClassificationResult {
  intent: Intent
  confidence: number  // 0..1
  sentiment: Sentiment
}

const INTENT_DESCRIPTIONS: Record<Intent, string> = {
  booking_request: 'wants to book a PT session, class, or appointment',
  class_enquiry: 'asking about class times, availability, what is on',
  cancellation: 'cancelling a session, appointment, or membership',
  payment_query: 'asking about payments, receipts, refunds, billing',
  rescheduling: 'wants to move a session to a different time',
  feedback_complaint: 'giving feedback, raising a concern, complaining',
  referral_interest: 'asking about referring a friend or sharing',
  faq_general: 'general question about the studio (parking, what to bring, etc.)',
  membership_query: 'asking about membership pricing, renewal, perks',
  pt_availability: 'a PT declaring their own weekly availability hours',
  social: 'greeting, thanks, social chat — no action needed',
  unclassifiable: 'cannot confidently classify — escalate',
}

export async function classifyIntent(
  messageText: string,
  sender: SenderContext
): Promise<ClassificationResult> {
  if (!ANTHROPIC_API_KEY) {
    return { intent: 'unclassifiable', confidence: 0, sentiment: 'neutral' }
  }

  const intentMenu = (Object.keys(INTENT_DESCRIPTIONS) as Intent[])
    .map((k) => `  - ${k}: ${INTENT_DESCRIPTIONS[k]}`)
    .join('\n')

  const senderHint =
    sender.type === 'unknown'
      ? "Unknown sender — likely a new enquiry."
      : sender.type === 'coach'
        ? `Sender is the coach/PT "${sender.display_name || 'unknown'}".`
        : `Sender is an existing member: "${sender.display_name || 'unknown'}".`

  const systemPrompt = `You classify incoming WhatsApp messages for a fitness studio coaching app.

Return ONLY a single JSON object on one line. Schema:
  {"intent":"<one of the labels>","confidence":<0..1>,"sentiment":"positive|neutral|negative"}

Available intent labels:
${intentMenu}

Rules:
- Pick exactly one intent label. No new labels.
- confidence: how sure you are. 0.9+ for obvious cases, 0.5 for ambiguous, below 0.3 → use unclassifiable.
- sentiment: tone of the message. Complaints → negative, thanks/praise → positive, neutral otherwise.
- A PT (coach) message about their own hours = pt_availability.
- A short greeting / thanks / 👍 / emoji-only = social.`

  const userMsg = `${senderHint}\n\nMessage: """${messageText.slice(0, 500)}"""\n\nReturn JSON now.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 80,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMsg }],
      }),
    })
    if (!res.ok) {
      return { intent: 'unclassifiable', confidence: 0, sentiment: 'neutral' }
    }
    const data = await res.json()
    const raw = (data.content?.[0]?.text || '').trim()
    const match = raw.match(/\{[^}]*"intent"\s*:\s*"[^"]+"[^}]*\}/)
    if (!match) {
      return { intent: 'unclassifiable', confidence: 0, sentiment: 'neutral' }
    }
    const parsed = JSON.parse(match[0]) as Partial<ClassificationResult>
    const intent: Intent =
      typeof parsed.intent === 'string' && parsed.intent in INTENT_DESCRIPTIONS
        ? (parsed.intent as Intent)
        : 'unclassifiable'
    const confidence = Math.max(
      0,
      Math.min(1, typeof parsed.confidence === 'number' ? parsed.confidence : 0)
    )
    const sentiment: Sentiment =
      parsed.sentiment === 'positive' || parsed.sentiment === 'negative'
        ? parsed.sentiment
        : 'neutral'
    return { intent, confidence, sentiment }
  } catch {
    return { intent: 'unclassifiable', confidence: 0, sentiment: 'neutral' }
  }
}

// ─── Logging ───
// Best-effort insert; failures here MUST NOT throw out of the webhook.

export interface InboxLogInput {
  sender: SenderContext
  messageText: string
  isGroup: boolean
  groupJid: string | null
  classification: ClassificationResult
  actionTaken: string | null
  resolvedBy: 'bot' | 'manager' | 'unresolved' | null
  escalated: boolean
  responseTimeMs: number | null
  messageId: string | null
}

export async function logInboxInteraction(input: InboxLogInput): Promise<void> {
  try {
    await sql`
      INSERT INTO inbox_log (
        sender_jid, sender_type, sender_record_id,
        coach_id, programme_id, message_text,
        is_group, group_jid,
        intent, intent_confidence, sentiment,
        action_taken, resolved_by, escalated,
        response_time_ms, message_id
      ) VALUES (
        ${input.sender.jid}, ${input.sender.type}, ${input.sender.record_id},
        ${input.sender.coach_id}, ${input.sender.programme_id},
        ${input.messageText.slice(0, 4000)},
        ${input.isGroup}, ${input.groupJid},
        ${input.classification.intent}, ${input.classification.confidence}, ${input.classification.sentiment},
        ${input.actionTaken}, ${input.resolvedBy}, ${input.escalated},
        ${input.responseTimeMs}, ${input.messageId}
      )
    `
  } catch (e) {
    // Don't surface — observability shouldn't break message flow.
    console.error('[inbox-agent] log insert failed:', e)
  }
}

// ─── Dashboard queries ───

export interface InboxStats {
  total_today: number
  bot_resolved_today: number
  escalated_today: number
  avg_response_ms_today: number | null
  sentiment_positive_pct: number
  sentiment_negative_pct: number
}

export async function getInboxStats(coachId: string | null = null): Promise<InboxStats> {
  // When coachId is null we get studio-wide stats. Otherwise filter to
  // messages where the resolved coach (member's programme coach) matches.
  const filterCoach = coachId
    ? sql`AND coach_id = ${coachId}`
    : sql``
  const { rows } = await sql`
    SELECT
      COUNT(*)::int as total_today,
      COUNT(*) FILTER (WHERE resolved_by = 'bot')::int as bot_resolved_today,
      COUNT(*) FILTER (WHERE escalated = true)::int as escalated_today,
      AVG(response_time_ms) FILTER (WHERE response_time_ms IS NOT NULL) as avg_response_ms_today,
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE sentiment = 'positive') / NULLIF(COUNT(*), 0),
        1
      ) as sentiment_positive_pct,
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE sentiment = 'negative') / NULLIF(COUNT(*), 0),
        1
      ) as sentiment_negative_pct
    FROM inbox_log
    WHERE received_at > NOW() - INTERVAL '24 hours'
    ${filterCoach}
  `
  const r = rows[0] || {}
  return {
    total_today: Number(r.total_today || 0),
    bot_resolved_today: Number(r.bot_resolved_today || 0),
    escalated_today: Number(r.escalated_today || 0),
    avg_response_ms_today: r.avg_response_ms_today != null ? Number(r.avg_response_ms_today) : null,
    sentiment_positive_pct: r.sentiment_positive_pct != null ? Number(r.sentiment_positive_pct) : 0,
    sentiment_negative_pct: r.sentiment_negative_pct != null ? Number(r.sentiment_negative_pct) : 0,
  }
}

export async function listRecentInboxEntries(coachId: string | null = null, limit = 50) {
  const filterCoach = coachId ? sql`AND coach_id = ${coachId}` : sql``
  const { rows } = await sql`
    SELECT id, received_at, sender_jid, sender_type, message_text,
           is_group, group_jid, intent, intent_confidence, sentiment,
           action_taken, resolved_by, escalated, response_time_ms
    FROM inbox_log
    WHERE 1=1 ${filterCoach}
    ORDER BY received_at DESC
    LIMIT ${limit}
  `
  return rows
}
