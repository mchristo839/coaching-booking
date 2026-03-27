import { NextRequest, NextResponse } from 'next/server'
import { findProgramByWhatsAppGroup, type Knowledgebase } from '@/app/lib/db'
import { sendWhatsAppMessage } from '@/app/lib/evolution'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'paul-bot'

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Evolution API webhook payload structure
    const event = body.event
    const instance = body.instance
    const data = body.data

    // Only handle incoming text messages from groups
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

    // Look up which program this group belongs to
    const program = await findProgramByWhatsAppGroup(groupJid)

    if (!program) {
      // Group not linked to any program — ignore silently
      console.log(`Unlinked group message from ${groupJid}, instance ${instance}`)
      return NextResponse.json({ ok: true })
    }

    if (!program.knowledgebase) {
      // Program exists but has no knowledgebase configured yet
      console.log(`Program ${program.id} has no knowledgebase, skipping`)
      return NextResponse.json({ ok: true })
    }

    const senderName: string = data?.pushName || 'there'
    const messageWithContext = `${senderName} asks: ${messageText}`

    const systemPrompt = buildSystemPrompt({
      program_name: program.program_name,
      coach_name: program.coach_name,
      knowledgebase: program.knowledgebase as Knowledgebase,
    })

    const reply = await askClaude(systemPrompt, messageWithContext)

    await sendWhatsAppMessage(groupJid, reply)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('WhatsApp webhook error:', error)
    // Always return 200 to Evolution API so it doesn't retry endlessly
    return NextResponse.json({ ok: true })
  }
}
