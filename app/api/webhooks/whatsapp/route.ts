import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { sendWhatsAppMessage } from '@/app/lib/evolution'

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

// ─── Types ───

type SenderType = 'known_coach' | 'known_parent' | 'unknown'

type Category =
  | 'schedule' | 'venue' | 'pricing' | 'kit' | 'availability'
  | 'holiday' | 'refund' | 'programme' | 'credentials' | 'fixture'
  | 'welfare' | 'complaint' | 'medical' | 'social' | 'unknown'

const IMMEDIATE_ESCALATION_CATEGORIES: Category[] = ['welfare', 'complaint', 'medical']
const SOFT_ESCALATION_CATEGORIES: Category[] = ['fixture', 'unknown']

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
  // Strip common emoji ranges, variation selectors, ZWJ, skin tones, and whitespace
  const stripped = text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{27BF}\u{2B50}\u{2764}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}\u{2705}\u{274C}\s]/gu, '')
  return stripped.length === 0 && text.trim().length > 0
}

function classifyMessage(text: string): Category {
  const lower = text.toLowerCase().trim()

  // Emoji-only messages are social
  if (isEmojiOnly(text)) return 'social'

  // Very short social messages (under 5 words, no question mark)
  const wordCount = lower.split(/\s+/).length
  if (wordCount <= 3 && !lower.includes('?')) {
    const socialHits = CATEGORY_KEYWORDS.social.filter((kw) => lower.includes(kw))
    if (socialHits.length > 0) return 'social'
  }

  // Check each category by keyword match — priority order matters
  // Welfare/complaint/medical checked first (escalation categories)
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
  // In groups, participant contains the sender's JID (e.g., 447123456789@s.whatsapp.net)
  // In 1:1 chats, remoteJid is the sender
  const key = data?.key as Record<string, unknown> | undefined
  const participant = key?.participant as string || ''
  const remoteJid = key?.remoteJid as string || ''

  const jid = participant || remoteJid
  // Extract phone number from JID: "447123456789@s.whatsapp.net" → "447123456789"
  return jid.split('@')[0] || ''
}

async function resolveSenderType(
  senderPhone: string,
  coachMobile: string,
): Promise<{ senderType: SenderType; memberRecord: Record<string, unknown> | null }> {
  // Check if this is the coach (compare phone numbers)
  if (coachMobile) {
    const coachClean = coachMobile.replace(/\D/g, '')
    const senderClean = senderPhone.replace(/\D/g, '')
    if (coachClean && senderClean && (coachClean.endsWith(senderClean) || senderClean.endsWith(coachClean))) {
      return { senderType: 'known_coach', memberRecord: null }
    }
  }

  // Check if this is a known member/parent
  try {
    const members = await findMemberByPhone(senderPhone)
    if (members && members.length > 0) {
      return { senderType: 'known_parent', memberRecord: members[0] as Record<string, unknown> }
    }
  } catch {
    // Member lookup failed — continue
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

  // Build programme details section
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

  // Build FAQ section
  const faqLines = faqs
    .filter((f) => f.question && f.answer)
    .map((f) => `Q: ${f.question}\nA: ${f.answer}`)
    .join('\n\n')
  const faqSection = faqLines ? `\n\nFrequently Asked Questions:\n${faqLines}` : ''

  // Identity context
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
10. If you're unsure, recommend contacting ${coachName} directly.`
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

  // DM the coach privately
  if (coachPhone) {
    const coachJid = `${coachPhone.replace(/\D/g, '')}@s.whatsapp.net`
    await sendWhatsAppMessage(
      coachJid,
      `🔴 ${label} — ${senderName} said: "${messageText}". This needs your direct response.`,
    )
  }

  // Reply in the group
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
  reply: string,
): Promise<void> {
  // Flag to coach privately after answering
  if (coachPhone) {
    const coachJid = `${coachPhone.replace(/\D/g, '')}@s.whatsapp.net`
    await sendWhatsAppMessage(
      coachJid,
      `🟡 Heads up — ${senderName} asked: "${messageText}". I answered but you may want to check. Category: ${category}.`,
    )
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
    // Simple overlap check: if 3+ words from the FAQ question appear in the message
    const questionWords = question.split(/\s+/).filter((w) => w.length > 3)
    const matchCount = questionWords.filter((w) => lower.includes(w)).length
    if (matchCount >= 2) return true
  }
  return false
}

// ─── Main Webhook Handler ───

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // 1. Filter
    const event = (body.event || '').toLowerCase()
    if (event !== 'messages.upsert') {
      return NextResponse.json({ ok: true })
    }

    const data = body.data
    if (data?.key?.fromMe) {
      return NextResponse.json({ ok: true })
    }

    const groupJid: string = data?.key?.remoteJid || ''
    if (!groupJid.endsWith('@g.us')) {
      return NextResponse.json({ ok: true })
    }

    const messageText: string =
      data?.message?.conversation ||
      data?.message?.extendedTextMessage?.text ||
      ''
    if (!messageText.trim()) {
      return NextResponse.json({ ok: true })
    }

    const senderName: string = data?.pushName || 'there'
    const senderPhone = extractSenderPhone(data)
    const instance: string = body.instance || ''

    // 2. Programme Lookup
    const programme = await findProgrammeByGroup(groupJid)

    if (!programme) {
      console.log(`Unlinked group message from ${groupJid}, instance ${instance}`)
      await sendWhatsAppMessage(
        groupJid,
        `👋 Hi! I'm your coaching assistant. To activate me for this group, go to your dashboard and paste in this group ID:\n\n*${groupJid}*`,
      )
      return NextResponse.json({ ok: true })
    }

    const coachId = programme.coach_id as string
    const coachName = `${programme.coach_first_name || ''} ${programme.coach_last_name || ''}`.trim()
    const programmeId = programme.id as string
    // For MVP, treat all coaches as live — observation mode is Phase 2
    const botStatus = (programme.whatsapp_bot_status as string) || 'live'

    // Check if programme has enough data to operate
    if (!programme.programme_name) {
      console.log(`Programme ${programmeId} has no data configured, skipping`)
      await sendWhatsAppMessage(
        groupJid,
        `👋 I'm connected to this group but haven't been set up yet. ${coachName}, please go to your dashboard and fill in the programme details to activate me.`,
      )
      return NextResponse.json({ ok: true })
    }

    // 4. Check Bot Mode
    if (botStatus === 'paused') {
      return NextResponse.json({ ok: true })
    }

    // 3. Identity Resolution
    const coachMobile = (programme.coach_mobile as string) || ''
    const { senderType, memberRecord } = await resolveSenderType(senderPhone, coachMobile)

    // 5. Question Classification
    const category = classifyMessage(messageText)

    // Social messages — don't respond (emoji reactions, "thanks", etc.)
    if (category === 'social') {
      await logConvo({
        programmeId,
        coachId,
        senderName,
        senderIdentifier: senderPhone,
        senderType,
        channel: 'whatsapp_group',
        messageText,
        category,
        botResponse: null as unknown as string,
        botMode: botStatus,
        escalated: false,
      })
      return NextResponse.json({ ok: true })
    }

    // Get coach phone for escalation DMs (already available from programme lookup)
    const coachPhone = coachMobile

    // 6. Escalation Check — Immediate
    if (IMMEDIATE_ESCALATION_CATEGORIES.includes(category)) {
      await handleImmediateEscalation(category, senderName, messageText, coachName, coachPhone, groupJid)

      await logConvo({
        programmeId,
        coachId,
        senderName,
        senderIdentifier: senderPhone,
        senderType,
        channel: 'whatsapp_group',
        messageText,
        category,
        botResponse: 'Escalated to coach',
        botMode: botStatus,
        escalated: true,
        escalationType: category,
        memberId: (memberRecord?.id as string) || undefined,
      })

      return NextResponse.json({ ok: true })
    }

    // 7. Build System Prompt
    const faqs = await getFaqs(programmeId)
    const systemPrompt = buildSystemPrompt(programme, faqs as Record<string, unknown>[], senderType, senderName)
    const messageWithContext = `${senderName} asks: ${messageText}`

    // 8. Call Claude
    const reply = await askClaude(systemPrompt, messageWithContext)

    // Observation mode — log but don't send
    if (botStatus === 'observation') {
      await logConvo({
        programmeId,
        coachId,
        senderName,
        senderIdentifier: senderPhone,
        senderType,
        channel: 'whatsapp_group',
        messageText,
        category,
        botResponse: reply,
        botMode: 'observation',
        escalated: false,
        memberId: (memberRecord?.id as string) || undefined,
      })
      return NextResponse.json({ ok: true })
    }

    // Live mode — send the reply
    await sendWhatsAppMessage(groupJid, reply)

    // 6b. Soft Escalation — answer was sent, but flag the coach
    if (SOFT_ESCALATION_CATEGORIES.includes(category)) {
      await handleSoftEscalation(category, senderName, messageText, coachPhone, reply)
    }

    // 9. Log Everything
    await logConvo({
      programmeId,
      coachId,
      senderName,
      senderIdentifier: senderPhone,
      senderType,
      channel: 'whatsapp_group',
      messageText,
      category,
      botResponse: reply,
      botMode: botStatus,
      escalated: SOFT_ESCALATION_CATEGORIES.includes(category),
      escalationType: SOFT_ESCALATION_CATEGORIES.includes(category) ? category : undefined,
      memberId: (memberRecord?.id as string) || undefined,
    })

    // 10. FAQ Learning — if no FAQ matched, create a pending one
    const hadFaqMatch = faqMatchesMessage(faqs as Record<string, unknown>[], messageText)
    if (!hadFaqMatch && !IMMEDIATE_ESCALATION_CATEGORIES.includes(category)) {
      await learnNewFaq(programmeId, messageText, reply, category)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('WhatsApp webhook error:', error)
    // Always return 200 so Evolution API doesn't retry endlessly
    return NextResponse.json({ ok: true })
  }
}
