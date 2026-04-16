import { NextRequest, NextResponse } from 'next/server'
import { findProgramByWhatsAppGroup, safeLogConversation, type Knowledgebase } from '@/app/lib/db'
import { sendWhatsAppMessage } from '@/app/lib/evolution'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''

function buildSystemPrompt(program: { program_name: string; coach_name: string; knowledgebase: Knowledgebase }): string {
  const kb = program.knowledgebase

  const faqSection = kb.customFaqs && kb.customFaqs.length > 0
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

/** Simple category classification based on message content */
function classifyMessage(text: string): { category: string; escalated: boolean } {
  const lower = text.toLowerCase()

  // Escalation keywords
  const escalationPatterns = [
    /injur/i, /hurt/i, /accident/i, /emergency/i, /ambulance/i,
    /complain/i, /safeguard/i, /abuse/i, /bully/i, /inappropriat/i,
    /refund/i, /legal/i, /solicitor/i, /lawyer/i,
  ]

  for (const pattern of escalationPatterns) {
    if (pattern.test(lower)) {
      return { category: 'escalation', escalated: true }
    }
  }

  // Question detection
  if (lower.includes('?') || /^(when|where|what|how|can|do|is|are|will|does)\b/i.test(lower)) {
    return { category: 'question', escalated: false }
  }

  // Social / greeting
  if (/^(hi|hey|hello|thanks|thank you|cheers|good morning|good evening|👍|😊|🙏)/i.test(lower)) {
    return { category: 'social', escalated: false }
  }

  return { category: 'general', escalated: false }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const event = body.event
    const data = body.data

    // Only handle incoming text messages
    if (event !== 'messages.upsert') {
      return NextResponse.json({ ok: true })
    }

    // Ignore messages sent by the bot itself
    if (data?.key?.fromMe) {
      return NextResponse.json({ ok: true })
    }

    // Only handle group messages (group JIDs end in @g.us)
    const groupJid: string = data?.key?.remoteJid || ''
    if (!groupJid.endsWith('@g.us')) {
      return NextResponse.json({ ok: true })
    }

    // Extract message text
    const messageText: string =
      data?.message?.conversation ||
      data?.message?.extendedTextMessage?.text ||
      ''

    if (!messageText.trim()) {
      return NextResponse.json({ ok: true })
    }

    const senderJid: string = data?.key?.participant || data?.key?.remoteJid || ''
    const senderName: string = data?.pushName || 'there'

    console.log(`[LOG] Incoming message from ${senderName} in ${groupJid}: ${messageText.slice(0, 100)}`)

    // Classify the message
    const { category, escalated } = classifyMessage(messageText)

    // Look up which program this group belongs to
    const program = await findProgramByWhatsAppGroup(groupJid)

    if (!program) {
      // Group not linked to any program
      console.log(`[LOG] Unlinked group: ${groupJid}`)
      const reply = `👋 Hi! I'm your CoachBook bot. To activate me for this group, go to your Programmes dashboard and paste in this group ID:\n\n*${groupJid}*`
      await sendWhatsAppMessage(groupJid, reply)

      await safeLogConversation({
        groupJid,
        senderJid,
        senderName,
        messageText,
        botResponse: reply,
        category: 'unlinked',
        escalated: false,
      })

      return NextResponse.json({ ok: true })
    }

    if (!program.knowledgebase) {
      // Program linked but knowledgebase not filled in yet
      console.log(`[LOG] Programme ${program.id} has no knowledgebase`)
      const reply = `👋 I'm connected to this group but my knowledgebase isn't set up yet. ${program.coach_name}, please go to your Programmes dashboard and fill in the programme details to activate me.`
      await sendWhatsAppMessage(groupJid, reply)

      await safeLogConversation({
        programmeId: program.id,
        groupJid,
        senderJid,
        senderName,
        messageText,
        botResponse: reply,
        category: 'no_knowledgebase',
        escalated: false,
      })

      return NextResponse.json({ ok: true })
    }

    const messageWithContext = `${senderName} asks: ${messageText}`

    const systemPrompt = buildSystemPrompt({
      program_name: program.program_name,
      coach_name: program.coach_name,
      knowledgebase: program.knowledgebase as Knowledgebase,
    })

    const reply = await askClaude(systemPrompt, messageWithContext)

    await sendWhatsAppMessage(groupJid, reply)

    console.log(`[LOG] Bot replied in ${groupJid}, category: ${category}, escalated: ${escalated}`)

    await safeLogConversation({
      programmeId: program.id,
      groupJid,
      senderJid,
      senderName,
      messageText,
      botResponse: reply,
      category,
      escalated,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[LOG-ERROR] WhatsApp webhook error:', error)
    // Always return 200 to Evolution API so it doesn't retry endlessly
    return NextResponse.json({ ok: true })
  }
}
