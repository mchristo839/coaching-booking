import { NextRequest, NextResponse } from 'next/server'
import {
  findProgramByWhatsAppGroup,
  canSendBotReply,
  recordBotReply,
  logMessage,
  getRecentMessages,
  getRecentQuestions,
  appendCustomFaq,
  type Knowledgebase,
} from '@/app/lib/db'
import { sendWhatsAppMessage } from '@/app/lib/evolution'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
const WEBHOOK_SECRET = process.env.EVOLUTION_WEBHOOK_SECRET || ''
const BOT_JID = process.env.BOT_JID || ''

// ─── Webhook Signature Verification ───

async function verifyWebhookSignature(rawBody: string, request: NextRequest): Promise<boolean> {
  if (!WEBHOOK_SECRET) {
    console.warn('EVOLUTION_WEBHOOK_SECRET not set — skipping webhook signature verification')
    return true
  }

  const signature = request.headers.get('x-evox-signature')
  const timestamp = request.headers.get('x-evox-time')

  if (!signature || !timestamp) return false

  const message = `${timestamp}.${rawBody}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  // Constant-time comparison
  if (expected.length !== signature.length) return false
  let result = 0
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  }
  return result === 0
}

// ─── Claude API ───

function buildSystemPrompt(
  program: { program_name: string; coach_name: string; knowledgebase: Knowledgebase },
  conversationContext: string
): string {
  const kb = program.knowledgebase

  const faqSection =
    kb.customFaqs && kb.customFaqs.length > 0
      ? `\nAdditional Q&A:\n${kb.customFaqs.map((f) => `Q: ${f.q}\nA: ${f.a}`).join('\n\n')}`
      : ''

  return `You are a helpful assistant for ${program.program_name}, a coaching programme run by ${program.coach_name}.

Your job is to answer questions from parents and participants in this WhatsApp group. Only answer questions about this specific programme. If asked about anything unrelated, politely say you can only help with questions about ${program.program_name}.

Keep answers concise and friendly — this is a WhatsApp group, not an email. 2-3 sentences max unless a list is genuinely helpful.

Programme details:
- Sport: ${kb.sport}
- Venue: ${kb.venue}${kb.venueAddress ? ` (${kb.venueAddress})` : ''}
- Age group: ${kb.ageGroup}
- Skill level: ${kb.skillLevel}
- Schedule: ${kb.schedule}
- Price: £${(kb.priceCents / 100).toFixed(2)} per session
- What to bring: ${kb.whatToBring}
- Cancellation policy: ${kb.cancellationPolicy}
- Medical/injury info: ${kb.medicalInfo}
- About the coach: ${kb.coachBio}
${faqSection}
${conversationContext}
If you don't know the answer, say "I'm not sure about that — please contact the coach directly."`
}

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

async function extractQAPair(
  coachMessage: string,
  recentQuestions: { sender_name: string; message_text: string }[]
): Promise<{ q: string; a: string } | null> {
  if (recentQuestions.length === 0) return null

  const questionsBlock = recentQuestions
    .map((q, i) => `${i + 1}. ${q.sender_name}: ${q.message_text}`)
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
      system: `You extract Q&A pairs from coaching group chats. Given a coach's message and recent questions from parents, determine if the coach is answering one of the questions. If yes, return JSON: {"isAnswer": true, "q": "clean question", "a": "clean answer"}. If the coach is just chatting or the message doesn't answer a specific question, return {"isAnswer": false}. Return ONLY valid JSON, nothing else.`,
      messages: [
        {
          role: 'user',
          content: `Recent questions:\n${questionsBlock}\n\nCoach's message: ${coachMessage}`,
        },
      ],
    }),
  })

  if (!res.ok) return null
  const data = await res.json()
  const text = data.content?.[0]?.text || ''

  try {
    const parsed = JSON.parse(text)
    if (parsed.isAnswer && parsed.q && parsed.a) {
      return { q: parsed.q, a: parsed.a }
    }
  } catch {
    // Claude didn't return valid JSON — skip
  }
  return null
}

// ─── Mention Detection ───

function isBotMentioned(data: Record<string, any>, messageText: string): boolean {
  if (!BOT_JID) return true // If BOT_JID not configured, respond to all (backwards compat)

  const mentionedJid: string[] =
    data?.contextInfo?.mentionedJid ||
    data?.message?.extendedTextMessage?.contextInfo?.mentionedJid ||
    []

  if (mentionedJid.includes(BOT_JID)) return true

  // Check if bot phone number appears in message text
  const botPhone = BOT_JID.split('@')[0]
  if (botPhone && messageText.includes(botPhone)) return true

  return false
}

function stripMention(text: string): string {
  return text.replace(/@\d+/g, '').trim()
}

// ─── Main Handler ───

export async function POST(request: NextRequest) {
  try {
    // Read raw body for signature verification
    const rawBody = await request.text()

    // Verify webhook signature
    const valid = await verifyWebhookSignature(rawBody, request)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const body = JSON.parse(rawBody)
    const event = body.event
    const data = body.data

    // Only handle incoming text messages
    if (event !== 'messages.upsert') {
      return NextResponse.json({ ok: true })
    }

    if (data?.key?.fromMe) {
      return NextResponse.json({ ok: true })
    }

    // Only handle group messages
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

    const senderJid: string = data?.key?.participant || ''
    const senderName: string = data?.pushName || 'there'

    // ─── Program Lookup ───
    const program = await findProgramByWhatsAppGroup(groupJid)

    if (!program) {
      // Unlinked group — rate-limited auto-reply
      const canReply = await canSendBotReply(groupJid, 'unlinked_group')
      if (canReply) {
        await sendWhatsAppMessage(
          groupJid,
          `Hi! I'm your CoachBook bot. To activate me for this group, go to your Programmes dashboard and paste in this group ID:\n\n*${groupJid}*`
        )
        await recordBotReply(groupJid, 'unlinked_group')
      }
      return NextResponse.json({ ok: true })
    }

    if (!program.knowledgebase) {
      // No knowledgebase — rate-limited auto-reply
      const canReply = await canSendBotReply(groupJid, 'no_knowledgebase')
      if (canReply) {
        await sendWhatsAppMessage(
          groupJid,
          `I'm connected to this group but my knowledgebase isn't set up yet. ${program.coach_name}, please go to your Programmes dashboard and fill in the programme details to activate me.`
        )
        await recordBotReply(groupJid, 'no_knowledgebase')
      }
      return NextResponse.json({ ok: true })
    }

    // ─── Determine if sender is the coach ───
    const isFromCoach = !!(program.coach_whatsapp_jid && senderJid === program.coach_whatsapp_jid)

    // ─── Log the message ───
    await logMessage({
      programId: program.id,
      groupJid,
      senderJid,
      senderName,
      messageText,
      isFromCoach,
      isFromBot: false,
    })

    // ─── Coach learning: !learn command ───
    if (isFromCoach && messageText.trim().toLowerCase() === '!learn') {
      const recent = await getRecentMessages(groupJid, 20)
      const questions = recent.filter((m) => !m.is_from_coach && !m.is_from_bot)
      const coachMsgs = recent.filter((m) => m.is_from_coach)

      let learned = 0
      for (const coachMsg of coachMsgs) {
        const qa = await extractQAPair(
          coachMsg.message_text,
          questions.map((q) => ({ sender_name: q.sender_name, message_text: q.message_text }))
        )
        if (qa) {
          await appendCustomFaq(program.id, qa.q, qa.a)
          learned++
        }
      }

      await sendWhatsAppMessage(
        groupJid,
        learned > 0
          ? `Learned ${learned} new Q&A pair${learned > 1 ? 's' : ''} from recent conversation.`
          : `No new Q&A pairs found in recent messages.`
      )
      return NextResponse.json({ ok: true })
    }

    // ─── Coach auto-learning (silent) ───
    if (isFromCoach) {
      const recentQuestions = await getRecentQuestions(groupJid, 5)
      const qa = await extractQAPair(
        messageText,
        recentQuestions.map((q) => ({ sender_name: q.sender_name, message_text: q.message_text }))
      )
      if (qa) {
        await appendCustomFaq(program.id, qa.q, qa.a)
      }
      // Coach messages don't trigger a bot reply
      return NextResponse.json({ ok: true })
    }

    // ─── Mention check (non-coach messages only) ───
    if (!isBotMentioned(data, messageText)) {
      return NextResponse.json({ ok: true })
    }

    // ─── Build conversation context ───
    const recentMessages = await getRecentMessages(groupJid, 15)
    const conversationContext =
      recentMessages.length > 1
        ? `\nRecent conversation in the group:\n${recentMessages
            .slice(0, -1) // exclude the current message
            .map((m) => {
              const role = m.is_from_bot ? 'Bot' : m.is_from_coach ? 'Coach' : m.sender_name
              return `${role}: ${m.message_text}`
            })
            .join('\n')}\n`
        : ''

    // ─── Ask Claude and reply ───
    const cleanText = stripMention(messageText)
    const messageWithContext = `${senderName} asks: ${cleanText}`

    const systemPrompt = buildSystemPrompt(
      {
        program_name: program.program_name,
        coach_name: program.coach_name,
        knowledgebase: program.knowledgebase as Knowledgebase,
      },
      conversationContext
    )

    const reply = await askClaude(systemPrompt, messageWithContext)

    await sendWhatsAppMessage(groupJid, reply)

    // Log bot reply
    await logMessage({
      programId: program.id,
      groupJid,
      senderJid: BOT_JID || 'bot',
      senderName: 'Bot',
      messageText: reply,
      isFromCoach: false,
      isFromBot: true,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('WhatsApp webhook error:', error)
    return NextResponse.json({ ok: true })
  }
}
