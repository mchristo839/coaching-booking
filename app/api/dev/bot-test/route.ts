// app/api/dev/bot-test/route.ts
// Token-guarded tester for the group bot's decision logic. Paste any message and
// see exactly what the bot would do — answer, route to the coach, or stay silent
// — mirroring the live webhook (closed-intent gate + the "don't reply to chatter"
// guard). Optionally pass a real group's JID to use that programme's data.
//
//   GET /api/dev/bot-test?token=…&text=what%20time%20does%20it%20start
//   GET /api/dev/bot-test?token=…&text=see%20you%20saturday
//   GET /api/dev/bot-test?token=…&text=how%20much&group=120363...@g.us

import { NextRequest, NextResponse } from 'next/server'
import { findProgramByWhatsAppGroup, getProgrammeAvailability, type Knowledgebase } from '@/app/lib/db'
import {
  classifyBotIntent, planBotResponse, phraseAnswer, buildHandoffMessage, buildMissingDataMessage,
} from '@/app/lib/bot-intent'

const DEBUG_TOKEN = 'mca-camp-dbg-7f3a91c2'

const DEMO_KB: Knowledgebase = {
  sport: 'Football', venue: 'Victoria Park', venueAddress: 'London E9 7BT',
  ageGroup: '', // deliberately empty → "what ages?" demonstrates the no-guess route
  skillLevel: 'All levels', schedule: 'Mondays 5–6pm', duration: '1 hour',
  priceCents: 1500, paymentMethod: 'Bank transfer on booking', sessionType: '', campSchedule: '',
  whatToBring: 'Boots, shin pads, water', cancellationPolicy: '24h notice', medicalInfo: '',
  coachBio: '', customFaqs: [],
}

// Same guard the webhook uses for out-of-scope messages.
function looksActionable(t: string): boolean {
  const s = t.trim()
  const escalated = /injur|hurt|accident|emergency|complain|safeguard|abuse|bully|refund/i.test(s)
  return escalated || /\?/.test(s) ||
    /^(can|could|do|does|did|is|are|am|was|were|what|whats|when|where|why|how|who|which|will|would|should|any|anyone|has|have|had|may|please|need|want|book|booking|join|pay|sign|tell|let|looking|after)\b/i.test(s)
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  if (sp.get('token') !== DEBUG_TOKEN) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const text = (sp.get('text') || '').trim()
  if (!text) return NextResponse.json({ error: 'pass ?text=' }, { status: 400 })

  const group = sp.get('group')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let program: any = null
  if (group) { try { program = await findProgramByWhatsAppGroup(group) } catch { /* ignore */ } }
  const kb: Knowledgebase = (program?.knowledgebase as Knowledgebase) || DEMO_KB
  const programmeName: string = program?.program_name || 'Demo Programme'
  const coachName: string = program?.coach_name || 'the coach'

  const { intent, confidence } = await classifyBotIntent(text)

  let decision = ''
  let wouldReply = false
  let reply: string | null = null

  if (intent === 'social') {
    decision = 'STAY SILENT (social / chatter)'
  } else {
    const availability = intent === 'capacity_booking' && program ? await getProgrammeAvailability(program) : null
    const plan = planBotResponse(intent, kb, availability)
    if (plan.action === 'social') {
      decision = 'STAY SILENT (social)'
    } else if (plan.action === 'answer') {
      decision = `ANSWER (${plan.intent})`
      wouldReply = true
      reply = await phraseAnswer(text, plan.facts, programmeName)
    } else if (plan.reason === 'missing_data') {
      decision = `ROUTE TO COACH (in-scope, no data)`
      wouldReply = true
      reply = buildMissingDataMessage(coachName)
    } else {
      // out_of_scope — apply the chatter guard
      if (looksActionable(text)) {
        decision = 'ROUTE TO COACH (off-topic question)'
        wouldReply = true
        reply = buildHandoffMessage(coachName)
      } else {
        decision = 'STAY SILENT (off-topic chatter — not a question)'
      }
    }
  }

  return NextResponse.json({
    text,
    usingProgramme: program ? programmeName : 'demo data (pass ?group= for a real one)',
    intent,
    confidence,
    decision,
    wouldReply,
    reply,
  })
}
