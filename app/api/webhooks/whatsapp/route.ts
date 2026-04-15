import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { sendWhatsAppMessage } from '@/app/lib/evolution'

const WEBHOOK_SECRET = process.env.EVOLUTION_WEBHOOK_SECRET || ''
const BOT_JID = process.env.BOT_JID || ''

// ─── HMAC Signature Verification ───

async function verifyWebhookSignature(rawBody: string, signature: string | null): Promise<boolean> {
  if (!WEBHOOK_SECRET || !signature) return !WEBHOOK_SECRET // skip if not configured
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(WEBHOOK_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
    const computed = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
    return computed === signature.replace(/^sha256=/, '')
  } catch {
    return false
  }
}

// ─── Bot Reply Rate Limiting ───

async function canSendBotReply(groupJid: string, replyType: string, cooldownMinutes = 60): Promise<boolean> {
  const { rows } = await sql.query(
    "SELECT id FROM bot_replies WHERE group_jid = $1 AND reply_type = $2 AND sent_at > NOW() - ($3 || ' minutes')::INTERVAL LIMIT 1",
    [groupJid, replyType, cooldownMinutes.toString()]
  )
  return rows.length === 0
}

async function recordBotReply(groupJid: string, replyType: string): Promise<void> {
  await sql.query('INSERT INTO bot_replies (group_jid, reply_type) VALUES ($1, $2)', [groupJid, replyType])
}

// Use sql.query() everywhere to avoid stale Neon read replica issues
async function findProgrammeByGroup(groupJid: string) {
  const { rows } = await sql.query(`
    SELECT p.*, c.first_name as coach_first_name, c.last_name as coach_last_name, c.email as coach_email,
      c.whatsapp_bot_status, c.id as coach_id, c.mobile as coach_mobile,
      pr.trading_name
    FROM programmes p
    JOIN coaches_v2 c ON c.id = p.coach_id
    JOIN providers pr ON pr.id = c.provider_id
    WHERE p.whatsapp_group_id = $1 AND p.is_active = true
    LIMIT 1
  `, [groupJid])
  return rows[0] || null
}

async function getFaqs(programmeId: string) {
  const { rows } = await sql.query('SELECT * FROM faqs WHERE programme_id = $1 AND status = $2 ORDER BY created_at', [programmeId, 'active'])
  return rows
}

async function findMemberByPhone(phone: string) {
  const { rows } = await sql.query('SELECT m.*, p.programme_name FROM members m JOIN programmes p ON p.id = m.programme_id WHERE m.parent_phone = $1 OR m.parent_whatsapp_id = $1 ORDER BY m.joined_at DESC', [phone])
  return rows
}

async function logConvo(data: Record<string, unknown>) {
  await sql.query(`INSERT INTO conversations (programme_id, coach_id, sender_name, sender_identifier, sender_type, channel, message_text, category, bot_response, bot_mode, escalated, escalation_type, member_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [data.programmeId||null, data.coachId||null, data.senderName||null, data.senderIdentifier||null, data.senderType||null, data.channel, data.messageText, data.category||null, data.botResponse||null, data.botMode||null, data.escalated||false, data.escalationType||null, data.memberId||null])
}

async function savePendingFaq(programmeId: string, question: string, suggestedAnswer: string, category: string) {
  await sql.query('INSERT INTO faqs (programme_id, question, answer, category, source, status) VALUES ($1,$2,$3,$4,$5,$6)',
    [programmeId, question, suggestedAnswer, category, 'learned', 'pending_coach_approval'])
}

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://coaching-booking-v3.vercel.app'

// ─── Types ───

type SenderType = 'known_coach' | 'known_parent' | 'unknown'

type Category =
  | 'schedule' | 'venue' | 'pricing' | 'kit' | 'availability'
  | 'holiday' | 'refund' | 'programme' | 'credentials' | 'fixture'
  | 'welfare' | 'complaint' | 'medical' | 'social' | 'unknown'

const IMMEDIATE_ESCALATION_CATEGORIES: Category[] = ['welfare', 'complaint', 'medical']
const SOFT_ESCALATION_CATEGORIES: Category[] = ['fixture', 'unknown']

// ─── Signup Session Management ───

interface SignupSession {
  id: string
  programme_id: string
  whatsapp_jid: string
  step: string
  data: Record<string, string>
  created_at: string
  updated_at: string
}

async function getSignupSession(whatsappJid: string): Promise<SignupSession | null> {
  const { rows } = await sql.query(
    "SELECT * FROM signup_sessions WHERE whatsapp_jid = $1 AND updated_at > NOW() - INTERVAL '30 minutes' ORDER BY updated_at DESC LIMIT 1",
    [whatsappJid]
  )
  return (rows[0] as SignupSession) || null
}

async function createSignupSession(whatsappJid: string, programmeId: string): Promise<SignupSession> {
  const { rows } = await sql.query(
    "INSERT INTO signup_sessions (whatsapp_jid, programme_id, step, data) VALUES ($1, $2, 'parent_name', '{}') RETURNING *",
    [whatsappJid, programmeId]
  )
  return rows[0] as SignupSession
}

async function updateSignupSession(sessionId: string, step: string, data: Record<string, string>): Promise<void> {
  await sql.query(
    'UPDATE signup_sessions SET step = $1, data = $2, updated_at = NOW() WHERE id = $3',
    [step, JSON.stringify(data), sessionId]
  )
}

async function deleteSignupSession(sessionId: string): Promise<void> {
  await sql.query('DELETE FROM signup_sessions WHERE id = $1', [sessionId])
}

const PROGRAMME_FULL_SELECT = `
  SELECT p.*, c.first_name as coach_first_name, c.last_name as coach_last_name,
    c.id as coach_id, c.mobile as coach_mobile, pr.trading_name
  FROM programmes p
  JOIN coaches_v2 c ON c.id = p.coach_id
  JOIN providers pr ON pr.id = c.provider_id`

// Find which programme this DM user was chatting about (from their group messages)
// Returns null if we can't confidently determine the programme (triggers picker)
async function findProgrammeForDmUser(senderPhone: string): Promise<Record<string, unknown> | null> {
  // Check if sender is a member of any programme
  const { rows: memberRows } = await sql.query(
    "SELECT m.programme_id FROM members m WHERE (m.parent_phone = $1 OR m.parent_whatsapp_id = $1) AND m.status IN ('active', 'trial') ORDER BY m.joined_at DESC LIMIT 1",
    [senderPhone]
  )
  if (memberRows.length > 0) {
    const { rows } = await sql.query(`${PROGRAMME_FULL_SELECT} WHERE p.id = $1 AND p.is_active = true LIMIT 1`, [memberRows[0].programme_id])
    return rows[0] || null
  }

  // Check recent conversations from this sender in any group
  const { rows: convoRows } = await sql.query(
    "SELECT programme_id FROM conversations WHERE sender_identifier = $1 AND programme_id IS NOT NULL ORDER BY created_at DESC LIMIT 1",
    [senderPhone]
  )
  if (convoRows.length > 0) {
    const { rows } = await sql.query(`${PROGRAMME_FULL_SELECT} WHERE p.id = $1 AND p.is_active = true LIMIT 1`, [convoRows[0].programme_id])
    return rows[0] || null
  }

  // Fallback: only auto-select if there's exactly ONE active programme
  const { rows } = await sql.query(`${PROGRAMME_FULL_SELECT} WHERE p.is_active = true ORDER BY p.created_at DESC LIMIT 2`)
  if (rows.length === 1) return rows[0]

  // Multiple programmes or none — return null to trigger the picker
  return null
}

// Get all active programmes (for the DM programme picker)
async function listActiveProgrammes(): Promise<Record<string, unknown>[]> {
  const { rows } = await sql.query(`${PROGRAMME_FULL_SELECT} WHERE p.is_active = true ORDER BY p.programme_name ASC`)
  return rows
}

// Load a specific programme by ID
async function getProgrammeById(programmeId: string): Promise<Record<string, unknown> | null> {
  const { rows } = await sql.query(`${PROGRAMME_FULL_SELECT} WHERE p.id = $1 AND p.is_active = true LIMIT 1`, [programmeId])
  return rows[0] || null
}

// Send the programme picker message and store a pending selection session
async function sendProgrammePicker(senderJid: string, programmes: Record<string, unknown>[], context: 'question' | 'signup'): Promise<void> {
  let msg = context === 'signup'
    ? "Which programme would you like to join?\n\n"
    : "Hi! I help with a few programmes. Which one are you asking about?\n\n"

  programmes.forEach((p, i) => {
    const name = p.programme_name as string
    const extra: string[] = []
    if (p.session_days) {
      const days = Array.isArray(p.session_days) ? (p.session_days as string[]).join(', ') : String(p.session_days)
      extra.push(days)
    }
    if (p.session_start_time) extra.push(p.session_start_time as string)
    const suffix = extra.length > 0 ? ` _(${extra.join(' · ')})_` : ''
    msg += `*${i + 1}.* ${name}${suffix}\n`
  })

  msg += `\nJust reply with the number.`

  // Store pending selection as a signup session with step 'pick_programme'
  // We use programme_id of first one as placeholder — it'll be replaced on selection
  await sql.query(
    "INSERT INTO signup_sessions (whatsapp_jid, programme_id, step, data) VALUES ($1, $2, 'pick_programme', $3)",
    [senderJid, programmes[0].id, JSON.stringify({ context, programmeIds: programmes.map(p => p.id) })]
  )

  await sendWhatsAppMessage(senderJid, msg)
}

// ─── Question Classifier ───

const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  welfare: [
    'hurt', 'injured', 'upset', 'bullied', 'uncomfortable',
    'worried about', 'safeguarding', 'concern', 'abuse', 'scared',
  ],
  complaint: [
    'not happy', 'unhappy', 'complaint', 'disgusted', 'unacceptable',
    'poor', 'terrible', 'appalling', 'disappointed', 'furious',
  ],
  medical: [
    'asthma', 'injury', 'allergic', 'medical', 'condition',
    'inhaler', 'epipen', 'medication', 'allergy', 'disability',
  ],
  social: [
    'great session', 'thanks', 'well done', 'amazing', 'brilliant',
    'love it', 'fantastic', 'good job', 'thank you', 'cheers',
  ],
  schedule: [
    'time', 'when', 'what time', 'schedule', 'session',
    'day', 'start', 'finish', 'what days', 'timetable',
  ],
  venue: [
    'where', 'location', 'address', 'parking', 'directions',
    'transport', 'postcode', 'find you', 'how to get',
  ],
  pricing: [
    'cost', 'price', 'how much', 'pay', 'payment',
    'fee', 'discount', 'charge', 'rates',
  ],
  kit: [
    'bring', 'wear', 'kit', 'equipment', 'boots',
    'uniform', 'shin pads', 'trainers', 'clothing',
  ],
  availability: [
    'space', 'available', 'full', 'join', 'sign up',
    'enrol', 'register', 'trial', 'waitlist', 'waiting list',
  ],
  holiday: [
    'holiday', 'half term', 'easter', 'summer', 'christmas',
    'break', 'bank holiday', 'closed', 'time off',
  ],
  refund: [
    'refund', 'cancel', 'money back', 'cancellation',
    'get my money', 'reimburs',
  ],
  programme: [
    'age', 'ability', 'level', 'beginner', 'mixed',
    'what do they learn', 'curriculum', 'syllabus', 'advanced',
  ],
  credentials: [
    'dbs', 'qualified', 'qualification', 'accredited',
    'insurance', 'first aid', 'certified', 'crb',
  ],
  fixture: [
    'match', 'fixture', 'game', 'tournament', 'who are we playing',
    'league', 'cup', 'competition',
  ],
  unknown: [],
}

function isEmojiOnly(text: string): boolean {
  const stripped = text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{27BF}\u{2B50}\u{2764}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}\u{2705}\u{274C}\s]/gu, '')
  return stripped.length === 0 && text.trim().length > 0
}

function classifyMessage(text: string): Category {
  const lower = text.toLowerCase().trim()

  if (isEmojiOnly(text)) return 'social'

  const wordCount = lower.split(/\s+/).length
  if (wordCount <= 3 && !lower.includes('?')) {
    const socialHits = CATEGORY_KEYWORDS.social.filter((kw) => lower.includes(kw))
    if (socialHits.length > 0) return 'social'
  }

  const priorityOrder: Category[] = [
    'welfare', 'complaint', 'medical',
    'schedule', 'venue', 'pricing', 'kit', 'availability',
    'holiday', 'refund', 'programme', 'credentials', 'fixture',
    'social',
  ]

  for (const category of priorityOrder) {
    const keywords = CATEGORY_KEYWORDS[category]
    for (const kw of keywords) {
      if (lower.includes(kw)) return category
    }
  }

  return 'unknown'
}

// ─── Identity Resolution ───

function extractSenderPhone(data: Record<string, unknown>): string {
  const key = data?.key as Record<string, unknown> | undefined
  const participant = key?.participant as string || ''
  const remoteJid = key?.remoteJid as string || ''
  const jid = participant || remoteJid
  return jid.split('@')[0] || ''
}

async function resolveSenderType(
  senderPhone: string,
  coachMobile: string,
): Promise<{ senderType: SenderType; memberRecord: Record<string, unknown> | null }> {
  if (coachMobile) {
    const coachClean = coachMobile.replace(/\D/g, '')
    const senderClean = senderPhone.replace(/\D/g, '')
    if (coachClean && senderClean && (coachClean.endsWith(senderClean) || senderClean.endsWith(coachClean))) {
      return { senderType: 'known_coach', memberRecord: null }
    }
  }

  try {
    const members = await findMemberByPhone(senderPhone)
    if (members && members.length > 0) {
      return { senderType: 'known_parent', memberRecord: members[0] as Record<string, unknown> }
    }
  } catch {
    // Member lookup failed
  }

  return { senderType: 'unknown', memberRecord: null }
}

// ─── System Prompt Builder ───

function buildSystemPrompt(
  programme: Record<string, unknown>,
  faqs: Record<string, unknown>[],
  senderType: SenderType,
  senderName: string,
): string {
  const coachName = `${programme.coach_first_name || ''} ${programme.coach_last_name || ''}`.trim()
  const tradingName = programme.trading_name as string || coachName
  const progName = programme.programme_name as string || 'this programme'
  const progId = programme.id as string
  const joinUrl = `${APP_BASE_URL}/join/${progId}`

  const details: string[] = []
  if (programme.programme_name) details.push(`Programme: ${programme.programme_name}`)
  if (programme.short_description) details.push(`About: ${programme.short_description}`)
  if (programme.target_audience) details.push(`For: ${programme.target_audience}`)
  if (programme.specific_age_group) details.push(`Age group: ${programme.specific_age_group}`)
  if (programme.skill_level) details.push(`Skill level: ${programme.skill_level}`)
  if (programme.session_days) {
    const days = Array.isArray(programme.session_days)
      ? (programme.session_days as string[]).join(', ')
      : String(programme.session_days)
    details.push(`Session days: ${days}`)
  }
  if (programme.session_start_time) details.push(`Start time: ${programme.session_start_time}`)
  if (programme.session_duration) details.push(`Duration: ${programme.session_duration}`)
  if (programme.session_frequency) details.push(`Frequency: ${programme.session_frequency}`)
  if (programme.holiday_schedule) details.push(`Holidays: ${programme.holiday_schedule}`)
  if (programme.cancellation_notice) details.push(`Cancellation notice: ${programme.cancellation_notice}`)
  if (programme.venue_name) details.push(`Venue: ${programme.venue_name}`)
  if (programme.venue_address) details.push(`Address: ${programme.venue_address}`)
  if (programme.parking) details.push(`Parking: ${programme.parking}`)
  if (programme.nearest_transport) details.push(`Transport: ${programme.nearest_transport}`)
  if (programme.indoor_outdoor) details.push(`Setting: ${programme.indoor_outdoor}`)
  if (programme.bad_weather_policy) details.push(`Bad weather: ${programme.bad_weather_policy}`)
  if (programme.max_capacity) details.push(`Capacity: ${programme.max_capacity}`)
  if (programme.programme_status) details.push(`Status: ${programme.programme_status}`)
  if (programme.trial_available) details.push(`Trial: ${programme.trial_available}`)
  if (programme.trial_instructions) details.push(`Trial info: ${programme.trial_instructions}`)
  if (programme.what_to_bring) details.push(`What to bring: ${programme.what_to_bring}`)
  if (programme.equipment_provided) details.push(`Equipment provided: ${programme.equipment_provided}`)
  if (programme.kit_required) details.push(`Kit required: ${programme.kit_required}`)
  if (programme.kit_details) details.push(`Kit details: ${programme.kit_details}`)
  if (programme.paid_or_free) details.push(`Pricing type: ${programme.paid_or_free}`)
  if (programme.price_gbp) details.push(`Price: £${programme.price_gbp}`)
  if (programme.price_includes) details.push(`Price includes: ${programme.price_includes}`)
  if (programme.sibling_discount) details.push(`Sibling discount: ${programme.sibling_discount}`)
  if (programme.payment_model) details.push(`Payment model: ${programme.payment_model}`)
  if (programme.refund_policy) details.push(`Refund policy: ${programme.refund_policy}`)
  if (programme.refund_details) details.push(`Refund details: ${programme.refund_details}`)
  if (programme.payment_methods) {
    const methods = Array.isArray(programme.payment_methods)
      ? (programme.payment_methods as string[]).join(', ')
      : String(programme.payment_methods)
    details.push(`Payment methods: ${methods}`)
  }
  if (programme.bot_notes) details.push(`Additional notes: ${programme.bot_notes}`)

  const faqLines = faqs
    .filter((f) => f.question && f.answer)
    .map((f) => `Q: ${f.question}\nA: ${f.answer}`)
    .join('\n\n')
  const faqSection = faqLines ? `\n\nFrequently Asked Questions:\n${faqLines}` : ''

  let identityContext = ''
  if (senderType === 'known_coach') {
    identityContext = `\nThe person messaging is the coach (${coachName}) themselves. Answer helpfully but remember you are their assistant, not a peer.`
  } else if (senderType === 'known_parent') {
    identityContext = `\nThe person messaging is ${senderName}, a known parent/member of this programme.`
  } else {
    identityContext = `\nThe person messaging is ${senderName}. They may be a prospective or existing member.`
  }

  return `You are the WhatsApp assistant for ${progName}, run by ${tradingName}.
${identityContext}

PROGRAMME DETAILS:
${details.join('\n')}
${faqSection}

SIGNUP LINK: ${joinUrl}
When someone asks about joining, signing up, availability, or trials, include this link in your response so they can register online.

HARD RULES — you must always follow these:
1. Never invent information. If you don't know, say so and suggest contacting ${coachName} directly.
2. Never answer welfare, safeguarding, or complaint messages — those are routed to the coach.
3. Never share one family's information with another.
4. Never contradict the coach or make promises the coach hasn't authorised.
5. Always identify as the assistant, never pretend to be ${coachName}.
6. Keep responses concise — 2-3 sentences max. This is WhatsApp, not email.
7. Use ${coachName}'s name naturally, e.g. "${coachName}'s Saturday session".
8. Be warm and helpful but professional.
9. If asked something outside the scope of ${progName}, politely redirect.
10. If you're unsure, recommend contacting ${coachName} directly.
11. When someone wants to join or sign up, share the signup link: ${joinUrl}`
}

// ─── Claude API ───

async function askClaude(systemPrompt: string, userMessage: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  if (!res.ok) {
    throw new Error(`Claude API error ${res.status}`)
  }

  const data = await res.json()
  return data.content?.[0]?.text || "I'm not sure about that — please contact the coach directly."
}

// ─── Escalation Handlers ───

async function handleImmediateEscalation(
  category: Category,
  senderName: string,
  messageText: string,
  coachName: string,
  coachPhone: string,
  groupJid: string,
): Promise<void> {
  const categoryLabels: Record<string, string> = {
    welfare: 'Welfare/Safeguarding',
    complaint: 'Complaint',
    medical: 'Medical',
  }
  const label = categoryLabels[category] || category

  if (coachPhone) {
    const coachJid = `${coachPhone.replace(/\D/g, '')}@s.whatsapp.net`
    await sendWhatsAppMessage(
      coachJid,
      `🔴 ${label} — ${senderName} said: "${messageText}". This needs your direct response.`,
    )
  }

  await sendWhatsAppMessage(
    groupJid,
    `Thanks for letting us know. I've passed this to ${coachName} and they will be in touch with you directly.`,
  )
}

async function handleSoftEscalation(
  category: Category,
  senderName: string,
  messageText: string,
  coachPhone: string,
): Promise<void> {
  if (coachPhone) {
    const coachJid = `${coachPhone.replace(/\D/g, '')}@s.whatsapp.net`
    await sendWhatsAppMessage(
      coachJid,
      `🟡 Heads up — ${senderName} asked: "${messageText}". I answered but you may want to check. Category: ${category}.`,
    )
  }
}

// ─── Coach Auto-Learning ───

async function getRecentConversations(groupJid: string, limit = 20) {
  const { rows } = await sql.query(
    'SELECT sender_name, sender_type, message_text, created_at FROM conversations WHERE programme_id IN (SELECT id FROM programmes WHERE whatsapp_group_id = $1) ORDER BY created_at DESC LIMIT $2',
    [groupJid, limit]
  )
  return rows.reverse()
}

async function extractCoachLearning(
  programmeId: string,
  coachMessage: string,
  recentMessages: Record<string, unknown>[],
): Promise<void> {
  try {
    // Build context from recent messages to find what question the coach is answering
    const context = recentMessages
      .slice(-10)
      .map((m) => `${m.sender_name} (${m.sender_type}): ${m.message_text}`)
      .join('\n')

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: 'You extract Q&A pairs from coaching group conversations. When a coach answers a parent question, extract a clean FAQ. Respond ONLY with valid JSON: {"question":"...", "answer":"..."} or {"skip":true} if the coach message is not answering a question.',
        messages: [{
          role: 'user',
          content: `Recent messages:\n${context}\n\nCoach just said: "${coachMessage}"\n\nExtract the Q&A pair if the coach is answering a question. Return JSON only.`,
        }],
      }),
    })

    if (!res.ok) return

    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const parsed = JSON.parse(text)
    if (parsed.skip || !parsed.question || !parsed.answer) return

    await savePendingFaq(programmeId, parsed.question, parsed.answer, 'learned')
  } catch {
    // Silent — learning is best-effort
  }
}

async function batchLearnFromMessages(
  programmeId: string,
  groupJid: string,
): Promise<string> {
  try {
    const messages = await getRecentConversations(groupJid, 20)
    if (messages.length < 2) return 'Not enough messages to learn from yet.'

    const context = messages
      .map((m) => `${m.sender_name} (${m.sender_type}): ${m.message_text}`)
      .join('\n')

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: 'Extract all Q&A pairs from this coaching group conversation where parents asked questions and the coach answered. Return a JSON array: [{"question":"...", "answer":"..."}]. If no Q&A pairs found, return [].',
        messages: [{ role: 'user', content: context }],
      }),
    })

    if (!res.ok) return 'Failed to process messages.'

    const data = await res.json()
    const text = data.content?.[0]?.text || '[]'
    const pairs = JSON.parse(text)
    if (!Array.isArray(pairs) || pairs.length === 0) return 'No new Q&A pairs found in recent messages.'

    let saved = 0
    for (const pair of pairs) {
      if (pair.question && pair.answer) {
        await savePendingFaq(programmeId, pair.question, pair.answer, 'learned')
        saved++
      }
    }
    return `Found ${saved} Q&A pair${saved !== 1 ? 's' : ''} from recent messages. Check your Learning Log to review and approve them.`
  } catch {
    return 'Something went wrong while learning. Try again later.'
  }
}

// ─── FAQ Learning ───

async function learnNewFaq(
  programmeId: string,
  messageText: string,
  botResponse: string,
  category: Category,
): Promise<void> {
  try {
    await savePendingFaq(programmeId, messageText, botResponse, category)
  } catch (err) {
    console.error('Failed to create learned FAQ:', err)
  }
}

function faqMatchesMessage(faqs: Record<string, unknown>[], messageText: string): boolean {
  const lower = messageText.toLowerCase()
  for (const faq of faqs) {
    const question = ((faq.question as string) || '').toLowerCase()
    const questionWords = question.split(/\s+/).filter((w) => w.length > 3)
    const matchCount = questionWords.filter((w) => lower.includes(w)).length
    if (matchCount >= 2) return true
  }
  return false
}

// ─── DM Signup Flow Handler ───

async function handleDmSignup(
  senderJid: string,
  senderName: string,
  messageText: string,
): Promise<boolean> {
  const lower = messageText.toLowerCase().trim()

  // Check for existing session
  let session = await getSignupSession(senderJid)

  // If no session, check if the user wants to sign up
  if (!session) {
    const wantsToJoin = /\b(join|sign up|signup|register|enrol|enroll|trial|book|interested)\b/i.test(lower)
    if (!wantsToJoin) return false // Not a signup message, let normal flow handle it

    // Find a programme for this user
    const senderPhone = senderJid.split('@')[0]
    const programme = await findProgrammeForDmUser(senderPhone)
    if (!programme) {
      // Multiple programmes — show picker for signup
      const allProgs = await listActiveProgrammes()
      if (allProgs.length > 1) {
        await sendProgrammePicker(senderJid, allProgs, 'signup')
        return true
      }
      return false // No programmes at all
    }

    const progId = programme.id as string
    const progName = programme.programme_name as string
    const joinUrl = `${APP_BASE_URL}/join/${progId}`

    // Offer both options: quick web signup or WhatsApp flow
    await sendWhatsAppMessage(
      senderJid,
      `Great, you'd like to join *${progName}*! 🎉\n\n` +
      `You can sign up in two ways:\n\n` +
      `1️⃣ *Quick online signup* (recommended):\n${joinUrl}\n\n` +
      `2️⃣ *Sign up here on WhatsApp* — just reply with *"sign up here"* and I'll walk you through it.\n\n` +
      `Which would you prefer?`
    )
    return true
  }

  // Handle ongoing signup session
  return await processSignupStep(session, senderJid, senderName, messageText)
}

async function processSignupStep(
  session: SignupSession,
  senderJid: string,
  senderName: string,
  messageText: string,
): Promise<boolean> {
  const text = messageText.trim()
  const lower = text.toLowerCase()
  const data = typeof session.data === 'string' ? JSON.parse(session.data) : session.data || {}

  // Handle cancellation at any step
  if (lower === 'cancel' || lower === 'stop' || lower === 'quit') {
    await deleteSignupSession(session.id)
    await sendWhatsAppMessage(senderJid, 'No problem — signup cancelled. You can start again any time by saying "join".')
    return true
  }

  switch (session.step) {
    case 'pick_programme': {
      // User is selecting a programme from the numbered list
      const num = parseInt(lower, 10)
      const programmeIds: string[] = data.programmeIds || []
      if (isNaN(num) || num < 1 || num > programmeIds.length) {
        await sendWhatsAppMessage(senderJid, `Please reply with a number between 1 and ${programmeIds.length}.`)
        return true
      }

      const selectedId = programmeIds[num - 1]
      const context = data.context || 'question'

      if (context === 'signup') {
        // They picked a programme for signup — transition to the signup flow
        await deleteSignupSession(session.id)
        await createSignupSession(senderJid, selectedId)
        const prog = await getProgrammeById(selectedId)
        const progName = (prog?.programme_name as string) || 'this programme'
        const joinUrl = `${APP_BASE_URL}/join/${selectedId}`
        await sendWhatsAppMessage(
          senderJid,
          `Great, you'd like to join *${progName}*! 🎉\n\n` +
          `You can sign up in two ways:\n\n` +
          `1️⃣ *Quick online signup* (recommended):\n${joinUrl}\n\n` +
          `2️⃣ *Sign up here on WhatsApp* — just reply with *"sign up here"* and I'll walk you through it.\n\n` +
          `Which would you prefer?`
        )
        // Delete this signup session — a new one will be created if they choose option 2
        await deleteSignupSession(session.id)
        return true
      }

      // They picked a programme for a general question — store the selection and ask their question
      await deleteSignupSession(session.id)
      // Store the programme association in conversations so next time we remember
      await logConvo({
        programmeId: selectedId, senderName, senderIdentifier: senderJid.split('@')[0],
        senderType: 'unknown', channel: 'whatsapp_private',
        messageText: `[Selected programme ${num}]`, category: 'programme',
        botMode: 'live', escalated: false,
      })

      const prog = await getProgrammeById(selectedId)
      if (prog) {
        const progName = prog.programme_name as string
        await sendWhatsAppMessage(senderJid, `No problem — I'll answer questions about *${progName}*. Go ahead, what would you like to know?`)
      }
      return true
    }

    case 'parent_name': {
      data.parentName = text
      await updateSignupSession(session.id, 'child_name', data)
      // Check if programme is for under 18s
      const { rows } = await sql.query('SELECT target_audience FROM programmes WHERE id = $1', [session.programme_id])
      const audience = rows[0]?.target_audience
      if (audience === 'under_18s' || audience === 'both') {
        await sendWhatsAppMessage(senderJid, `Thanks ${text.split(' ')[0]}! What's your child's name?`)
      } else {
        // Skip child details for adult programmes
        data.childName = ''
        await updateSignupSession(session.id, 'phone', data)
        await sendWhatsAppMessage(senderJid, `Thanks ${text.split(' ')[0]}! What's the best phone number to reach you on?`)
      }
      return true
    }

    case 'child_name': {
      data.childName = text
      await updateSignupSession(session.id, 'phone', data)
      await sendWhatsAppMessage(senderJid, `Got it! What's the best phone number to reach you on? (or reply "same" to use this WhatsApp number)`)
      return true
    }

    case 'phone': {
      const phone = lower === 'same' || lower === 'this one' || lower === 'this number'
        ? senderJid.split('@')[0]
        : text.replace(/\s/g, '')
      data.parentPhone = phone
      await updateSignupSession(session.id, 'email', data)
      await sendWhatsAppMessage(senderJid, `And your email address? (or reply "skip" if you'd rather not share it)`)
      return true
    }

    case 'email': {
      data.parentEmail = lower === 'skip' || lower === 'no' ? '' : text
      await updateSignupSession(session.id, 'medical', data)
      await sendWhatsAppMessage(senderJid, `Nearly done! Any medical conditions or allergies we should know about? (reply "none" if not)`)
      return true
    }

    case 'medical': {
      data.medicalNotes = lower === 'none' || lower === 'no' || lower === 'n/a' ? '' : text
      await updateSignupSession(session.id, 'confirm', data)

      // Build confirmation message
      let summary = `Here's a summary of your signup:\n\n`
      summary += `*Name:* ${data.parentName}\n`
      if (data.childName) summary += `*Child:* ${data.childName}\n`
      summary += `*Phone:* ${data.parentPhone}\n`
      if (data.parentEmail) summary += `*Email:* ${data.parentEmail}\n`
      if (data.medicalNotes) summary += `*Medical notes:* ${data.medicalNotes}\n`
      summary += `\nReply *"confirm"* to complete your signup, or *"cancel"* to start over.`

      await sendWhatsAppMessage(senderJid, summary)
      return true
    }

    case 'confirm': {
      if (lower !== 'confirm' && lower !== 'yes' && lower !== 'y') {
        await sendWhatsAppMessage(senderJid, 'Reply *"confirm"* to complete your signup, or *"cancel"* to start over.')
        return true
      }

      // Submit the signup
      try {
        const signupRes = await fetch(`${APP_BASE_URL}/api/members/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            programmeId: session.programme_id,
            parentName: data.parentName,
            parentEmail: data.parentEmail || null,
            parentPhone: data.parentPhone || null,
            parentWhatsappId: senderJid,
            childName: data.childName || null,
            medicalNotes: data.medicalNotes || null,
            source: 'whatsapp',
          }),
        })

        const result = await signupRes.json()
        await deleteSignupSession(session.id)

        if (signupRes.ok) {
          await sendWhatsAppMessage(senderJid, result.message || "You're all signed up! The coach will be in touch with next steps.")

          // Notify coach
          const { rows: progRows } = await sql.query(`
            SELECT p.programme_name, c.mobile as coach_mobile, c.first_name as coach_first_name
            FROM programmes p JOIN coaches_v2 c ON c.id = p.coach_id
            WHERE p.id = $1
          `, [session.programme_id])
          if (progRows[0]?.coach_mobile) {
            const coachJid = `${progRows[0].coach_mobile.replace(/\D/g, '')}@s.whatsapp.net`
            const statusEmoji = result.status === 'waitlisted' ? '🟡' : '🟢'
            await sendWhatsAppMessage(
              coachJid,
              `${statusEmoji} New ${result.status === 'waitlisted' ? 'waitlist' : 'signup'} for *${progRows[0].programme_name}*!\n\n` +
              `*Name:* ${data.parentName}\n` +
              (data.childName ? `*Child:* ${data.childName}\n` : '') +
              `*Via:* WhatsApp signup\n` +
              `Check your dashboard for details.`
            )
          }
        } else {
          await sendWhatsAppMessage(senderJid, result.message || "Sorry, there was an issue with the signup. Please try the online form or contact the coach directly.")
        }
      } catch (err) {
        console.error('WhatsApp signup submission error:', err)
        await deleteSignupSession(session.id)
        await sendWhatsAppMessage(senderJid, "Sorry, something went wrong. Please try again or use the online signup form.")
      }
      return true
    }

    default:
      await deleteSignupSession(session.id)
      return false
  }
}

// ─── Handle "sign up here" trigger to start WhatsApp flow ───

async function handleStartWhatsAppSignup(
  senderJid: string,
  senderPhone: string,
): Promise<boolean> {
  const programme = await findProgrammeForDmUser(senderPhone)
  if (!programme) {
    // Multiple programmes — show picker
    const allProgs = await listActiveProgrammes()
    if (allProgs.length === 0) {
      await sendWhatsAppMessage(senderJid, "Sorry, there are no programmes available right now. Please contact the coach directly.")
      return true
    }
    await sendProgrammePicker(senderJid, allProgs, 'signup')
    return true
  }

  await createSignupSession(senderJid, programme.id as string)
  const progName = programme.programme_name as string
  await sendWhatsAppMessage(
    senderJid,
    `Let's get you signed up for *${progName}*! 📋\n\nFirst, what's your full name?`
  )
  return true
}

// ─── Main Webhook Handler ───

export async function POST(request: NextRequest) {
  try {
    // ─── HMAC Signature Verification ───
    const rawBody = await request.text()
    const signature = request.headers.get('x-evox-signature')
    if (WEBHOOK_SECRET) {
      const valid = await verifyWebhookSignature(rawBody, signature)
      if (!valid) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }
    const body = JSON.parse(rawBody)

    // 1. Filter
    const event = (body.event || '').toLowerCase()
    if (event !== 'messages.upsert') {
      return NextResponse.json({ ok: true })
    }

    const data = body.data
    if (data?.key?.fromMe) {
      return NextResponse.json({ ok: true })
    }

    const remoteJid: string = data?.key?.remoteJid || ''
    const isGroup = remoteJid.endsWith('@g.us')
    const isDm = remoteJid.endsWith('@s.whatsapp.net')

    const messageText: string =
      data?.message?.conversation ||
      data?.message?.extendedTextMessage?.text ||
      ''
    if (!messageText.trim()) {
      return NextResponse.json({ ok: true })
    }

    const senderName: string = data?.pushName || 'there'
    const senderPhone = extractSenderPhone(data)

    // ─── DM HANDLING ───
    if (isDm) {
      const senderJid = remoteJid

      // Check for ongoing signup session
      const session = await getSignupSession(senderJid)
      if (session) {
        await processSignupStep(session, senderJid, senderName, messageText)
        return NextResponse.json({ ok: true })
      }

      // Check if they want to start WhatsApp signup
      const lower = messageText.toLowerCase().trim()
      if (lower === 'sign up here' || lower === 'signup here' || lower === 'option 2' || lower === '2') {
        await handleStartWhatsAppSignup(senderJid, senderPhone)
        return NextResponse.json({ ok: true })
      }

      // Try DM signup flow (checks if they want to join)
      const handledBySignup = await handleDmSignup(senderJid, senderName, messageText)
      if (handledBySignup) {
        return NextResponse.json({ ok: true })
      }

      // Regular DM — find their programme and answer as normal
      const programme = await findProgrammeForDmUser(senderPhone)
      if (programme) {
        const progId = programme.id as string
        const coachId = programme.coach_id as string
        const coachName = `${programme.coach_first_name || ''} ${programme.coach_last_name || ''}`.trim()
        const faqs = await getFaqs(progId)
        const coachMobile = (programme.coach_mobile as string) || ''
        const { senderType, memberRecord } = await resolveSenderType(senderPhone, coachMobile)

        const category = classifyMessage(messageText)

        // Social → ignore
        if (category === 'social') {
          return NextResponse.json({ ok: true })
        }

        // Immediate escalation
        if (IMMEDIATE_ESCALATION_CATEGORIES.includes(category)) {
          if (coachMobile) {
            const coachJid = `${coachMobile.replace(/\D/g, '')}@s.whatsapp.net`
            await sendWhatsAppMessage(
              coachJid,
              `🔴 DM from ${senderName}: "${messageText}". Category: ${category}. Needs your direct response.`,
            )
          }
          await sendWhatsAppMessage(senderJid, `Thanks for letting us know. I've passed this to ${coachName} and they'll be in touch directly.`)
          await logConvo({ programmeId: progId, coachId, senderName, senderIdentifier: senderPhone, senderType, channel: 'whatsapp_private', messageText, category, botResponse: 'Escalated to coach', botMode: 'live', escalated: true, escalationType: category, memberId: (memberRecord?.id as string) || undefined })
          return NextResponse.json({ ok: true })
        }

        const systemPrompt = buildSystemPrompt(programme, faqs as Record<string, unknown>[], senderType, senderName)
        const reply = await askClaude(systemPrompt, `${senderName} asks: ${messageText}`)
        await sendWhatsAppMessage(senderJid, reply)

        await logConvo({ programmeId: progId, coachId, senderName, senderIdentifier: senderPhone, senderType, channel: 'whatsapp_private', messageText, category, botResponse: reply, botMode: 'live', escalated: false, memberId: (memberRecord?.id as string) || undefined })
        return NextResponse.json({ ok: true })
      }

      // No programme determined — show picker if there are multiple, or helpful message if none
      const allProgs = await listActiveProgrammes()
      if (allProgs.length > 1) {
        await sendProgrammePicker(senderJid, allProgs, 'question')
        return NextResponse.json({ ok: true })
      } else if (allProgs.length === 0) {
        await sendWhatsAppMessage(senderJid, "Hi! I'm a coaching assistant but there are no active programmes set up yet. Please contact the coach directly.")
        return NextResponse.json({ ok: true })
      }
      // Shouldn't reach here (single programme would have been found above), but handle it
      await sendWhatsAppMessage(senderJid, "Hi! I'm a coaching assistant. If you'd like to join a programme, please ask in the group chat or contact your coach for the signup link.")
      return NextResponse.json({ ok: true })
    }

    // ─── GROUP MESSAGE HANDLING ───
    if (!isGroup) {
      return NextResponse.json({ ok: true })
    }

    const groupJid = remoteJid
    const instance: string = body.instance || ''

    // 2. Programme Lookup
    const programme = await findProgrammeByGroup(groupJid)

    if (!programme) {
      console.log(`Unlinked group message from ${groupJid}, instance ${instance}`)
      if (await canSendBotReply(groupJid, 'unlinked', 60)) {
        await sendWhatsAppMessage(
          groupJid,
          `👋 Hi! I'm your coaching assistant. To activate me for this group, go to your dashboard and paste in this group ID:\n\n*${groupJid}*`,
        )
        await recordBotReply(groupJid, 'unlinked')
      }
      return NextResponse.json({ ok: true })
    }

    const coachId = programme.coach_id as string
    const coachName = `${programme.coach_first_name || ''} ${programme.coach_last_name || ''}`.trim()
    const programmeId = programme.id as string
    const botStatus = (programme.whatsapp_bot_status as string) || 'live'

    if (!programme.programme_name) {
      console.log(`Programme ${programmeId} has no data configured, skipping`)
      if (await canSendBotReply(groupJid, 'no_config', 60)) {
        await sendWhatsAppMessage(
          groupJid,
          `👋 I'm connected to this group but haven't been set up yet. ${coachName}, please go to your dashboard and fill in the programme details to activate me.`,
        )
        await recordBotReply(groupJid, 'no_config')
      }
      return NextResponse.json({ ok: true })
    }

    if (botStatus === 'paused') {
      return NextResponse.json({ ok: true })
    }

    // 3. Identity Resolution
    const coachMobile = (programme.coach_mobile as string) || ''
    const { senderType, memberRecord } = await resolveSenderType(senderPhone, coachMobile)

    // Log ALL messages for conversation context
    await logConvo({
      programmeId, coachId, senderName, senderIdentifier: senderPhone, senderType,
      channel: 'whatsapp_group', messageText, category: classifyMessage(messageText),
      botMode: botStatus, escalated: false,
      memberId: (memberRecord?.id as string) || undefined,
    })

    // ─── Coach message handling ───
    if (senderType === 'known_coach') {
      // !learn command: batch extract Q&A from recent messages
      if (messageText.trim().toLowerCase() === '!learn') {
        const result = await batchLearnFromMessages(programmeId, groupJid)
        await sendWhatsAppMessage(groupJid, result)
        return NextResponse.json({ ok: true })
      }

      // Auto-learn from coach responses (silent)
      const recentMessages = await getRecentConversations(groupJid, 10)
      extractCoachLearning(programmeId, messageText, recentMessages).catch(() => {})

      return NextResponse.json({ ok: true })
    }

    // ─── @mention check: only respond if bot is mentioned ───
    const mentionedJids: string[] = data?.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
    const botPhone = BOT_JID.split('@')[0]
    const isMentioned = mentionedJids.includes(BOT_JID) ||
      (botPhone && messageText.includes(`@${botPhone}`))

    if (!isMentioned) {
      // Not mentioned — don't respond, message is already logged above
      return NextResponse.json({ ok: true })
    }

    // 5. Question Classification
    const category = classifyMessage(messageText)

    // Social messages — don't respond
    if (category === 'social') {
      return NextResponse.json({ ok: true })
    }

    const coachPhone = coachMobile

    // 6. Escalation Check — Immediate
    if (IMMEDIATE_ESCALATION_CATEGORIES.includes(category)) {
      await handleImmediateEscalation(category, senderName, messageText, coachName, coachPhone, groupJid)
      return NextResponse.json({ ok: true })
    }

    // 7. Build System Prompt & Call Claude (with conversation context)
    const faqs = await getFaqs(programmeId)
    const recentContext = await getRecentConversations(groupJid, 15)
    const contextLines = recentContext
      .map((m) => `${m.sender_name}: ${m.message_text}`)
      .join('\n')

    const systemPrompt = buildSystemPrompt(programme, faqs as Record<string, unknown>[], senderType, senderName)
    const systemWithContext = contextLines
      ? `${systemPrompt}\n\nRECENT CONVERSATION:\n${contextLines}`
      : systemPrompt
    const messageWithContext = `${senderName} asks: ${messageText}`
    const reply = await askClaude(systemWithContext, messageWithContext)

    // Observation mode
    if (botStatus === 'observation') {
      return NextResponse.json({ ok: true })
    }

    // Live mode — send reply
    await sendWhatsAppMessage(groupJid, reply)

    // Log bot response
    await logConvo({
      programmeId, coachId, senderName: 'Bot', senderIdentifier: BOT_JID,
      senderType: 'bot', channel: 'whatsapp_group', messageText: reply,
      category, botResponse: reply, botMode: botStatus, escalated: false,
    })

    // Soft escalation
    if (SOFT_ESCALATION_CATEGORIES.includes(category)) {
      await handleSoftEscalation(category, senderName, messageText, coachPhone)
    }

    // FAQ Learning
    const hadFaqMatch = faqMatchesMessage(faqs as Record<string, unknown>[], messageText)
    if (!hadFaqMatch && !IMMEDIATE_ESCALATION_CATEGORIES.includes(category)) {
      await learnNewFaq(programmeId, messageText, reply, category)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('WhatsApp webhook error:', error)
    return NextResponse.json({ ok: true })
  }
}
