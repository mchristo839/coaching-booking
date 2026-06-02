// app/lib/bot-intent.ts
// Closed-intent engine for the WhatsApp group bot.
//
// The group bot used to send every message to an open LLM prompt, which meant
// it would happily answer coaching advice, general-knowledge, or anything else
// a parent typed — under the coach's name. This module locks it down to a
// defined set of answerable intents with TWO guarantees enforced in code, not
// just in the prompt:
//
//   1. Out-of-scope questions are NEVER answered — they route to the coach.
//   2. In-scope questions whose backing data is empty are NEVER guessed —
//      they also route to the coach.
//
// Flow: classifyBotIntent() (wide recognition) → planBotResponse() (deterministic
// gate over real programme data) → phraseAnswer() (LLM phrases ONLY the resolved
// facts, as defence-in-depth so it can't pull in outside knowledge).
//
// SERVER-SIDE ONLY.

import type { Knowledgebase, ProgrammeAvailability } from '@/app/lib/db'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
const MODEL = 'claude-haiku-4-5-20251001'

// The only topics the bot will answer. Everything else is out_of_scope.
export const ALLOWED_INTENTS = [
  'location',
  'price',
  'payment',
  'duration',
  'session_type',
  'holiday_camps',
  'age_range',
  'what_to_bring',
  'capacity_booking',
] as const

export type AllowedIntent = (typeof ALLOWED_INTENTS)[number]
export type BotIntent = AllowedIntent | 'social' | 'out_of_scope'

const INTENT_MENU: Record<BotIntent, string> = {
  location: 'where sessions are held — venue, address, postcode, directions, "where is it"',
  price: 'how much it costs — price, fee, cost per session, "how much"',
  payment: 'how to pay — payment method, "do I pay now", bank transfer, cash, card',
  duration: 'how long a session lasts — session length, how long does it run',
  session_type: 'what a session actually is — "what kind of class", "what do they do"',
  holiday_camps: 'holiday provision — half term, Easter, summer, Christmas camps or holiday classes',
  age_range: 'what ages it suits — age range, "is it right for a 7 year old"',
  what_to_bring: 'what to bring or wear — kit, boots, trainers, water, equipment needed',
  capacity_booking: 'joining or availability — "is there space", "can my child join", "can I book a place"',
  social: 'greeting, thanks, emoji or small talk with no actual question',
  out_of_scope:
    'ANYTHING ELSE — coaching/fitness/technique advice, opinions, general knowledge, the weather, ' +
    'off-topic chat, complaints, injuries, safeguarding, or any question not covered by the labels above',
}

export interface BotClassification {
  intent: BotIntent
  confidence: number
}

// One cheap Haiku call. Recognises loose, casual phrasings but only ever emits
// a label from the closed set. Any failure (no key, network, bad JSON) falls
// back to out_of_scope so the safe path is "route to a human", never "guess".
export async function classifyBotIntent(messageText: string): Promise<BotClassification> {
  const text = (messageText || '').trim()
  if (!ANTHROPIC_API_KEY || !text) {
    return { intent: 'out_of_scope', confidence: 0 }
  }

  const menu = (Object.keys(INTENT_MENU) as BotIntent[])
    .map((k) => `  - ${k}: ${INTENT_MENU[k]}`)
    .join('\n')

  const system = `You are an intent router for a coaching programme's WhatsApp group assistant.

Classify the parent's message into EXACTLY ONE label. Recognise loose, casual, indirect phrasings:
"can my lad come along on Friday?" → capacity_booking; "what do they need to wear?" → what_to_bring;
"whereabouts is it?" → location.

Labels:
${menu}

Critical rules:
- Output exactly one label from the list. Never invent a label.
- If a message could be answered from general knowledge but is NOT one of the specific allowed topics, it is out_of_scope. e.g. "what's a good warm-up for kids?" → out_of_scope.
- Complaints, injuries, safeguarding or anything sensitive → out_of_scope (a human must handle it).
- Only a greeting / thanks / emoji with no question → social.

Return ONLY a single-line JSON object: {"intent":"<label>","confidence":<0..1>}`

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
        max_tokens: 40,
        system,
        messages: [{ role: 'user', content: `Message: """${text.slice(0, 500)}"""\n\nReturn JSON now.` }],
      }),
    })
    if (!res.ok) return { intent: 'out_of_scope', confidence: 0 }
    const data = await res.json()
    const raw = (data.content?.[0]?.text || '').trim()
    const match = raw.match(/\{[^}]*"intent"\s*:\s*"[^"]+"[^}]*\}/)
    if (!match) return { intent: 'out_of_scope', confidence: 0 }
    const parsed = JSON.parse(match[0]) as { intent?: string; confidence?: number }
    const intent: BotIntent =
      typeof parsed.intent === 'string' && parsed.intent in INTENT_MENU
        ? (parsed.intent as BotIntent)
        : 'out_of_scope'
    const confidence = Math.max(0, Math.min(1, typeof parsed.confidence === 'number' ? parsed.confidence : 0))
    return { intent, confidence }
  } catch {
    return { intent: 'out_of_scope', confidence: 0 }
  }
}

// ─── Deterministic gate ───

export type BotPlan =
  | { action: 'answer'; intent: BotIntent; facts: string }
  | { action: 'handoff'; intent: BotIntent; reason: 'out_of_scope' | 'missing_data' }
  | { action: 'social' }

function clean(s: string | undefined | null): string {
  return (s || '').trim()
}

// Maps an in-scope intent to the ONLY facts the answer LLM is allowed to use.
// Returns null when the backing field is empty → caller routes to the coach.
function intentFacts(intent: AllowedIntent, kb: Knowledgebase): string | null {
  switch (intent) {
    case 'location': {
      const parts = [clean(kb.venue), clean(kb.venueAddress)].filter(Boolean)
      return parts.length ? `Venue / address: ${parts.join(', ')}` : null
    }
    case 'price':
      return kb.priceCents > 0 ? `Price: £${(kb.priceCents / 100).toFixed(2)} per session` : null
    case 'payment':
      return clean(kb.paymentMethod) ? `How to pay: ${clean(kb.paymentMethod)}` : null
    case 'duration':
      return clean(kb.duration)
        ? `Session length: ${clean(kb.duration)}`
        : clean(kb.schedule)
          ? `Schedule (includes duration): ${clean(kb.schedule)}`
          : null
    case 'session_type':
      return clean(kb.sessionType) ? `What a session is: ${clean(kb.sessionType)}` : null
    case 'holiday_camps':
      return clean(kb.campSchedule) ? `Holiday camps: ${clean(kb.campSchedule)}` : null
    case 'age_range':
      return clean(kb.ageGroup) ? `Age range: ${clean(kb.ageGroup)}` : null
    case 'what_to_bring':
      return clean(kb.whatToBring) ? `What to bring: ${clean(kb.whatToBring)}` : null
    default:
      return null
  }
}

function capacityFacts(a: ProgrammeAvailability): string {
  switch (a.status) {
    case 'open':
      return a.spotsLeft != null
        ? `There is space — ${a.spotsLeft} place(s) currently free. The programme is open for booking.`
        : `The programme is open for booking and currently has space.`
    case 'waitlist':
      return a.waitlistEnabled
        ? `The programme is currently full, but the waitlist is open — they can be added and notified when a place frees up.`
        : `The programme is currently full.`
    case 'full':
      return `The programme is currently full.`
    case 'closed':
      return `The programme is not taking bookings at the moment.`
    default:
      return ''
  }
}

// The hard gate. Pure and deterministic over real data — this is what makes the
// two guarantees true regardless of what the LLM does. `availability` is only
// consulted for capacity_booking and may be null otherwise.
export function planBotResponse(
  intent: BotIntent,
  kb: Knowledgebase,
  availability: ProgrammeAvailability | null,
): BotPlan {
  if (intent === 'social') return { action: 'social' }
  if (intent === 'out_of_scope') return { action: 'handoff', intent, reason: 'out_of_scope' }

  if (intent === 'capacity_booking') {
    if (!availability || availability.status === 'unknown') {
      return { action: 'handoff', intent, reason: 'missing_data' }
    }
    return { action: 'answer', intent, facts: capacityFacts(availability) }
  }

  const facts = intentFacts(intent, kb)
  if (!facts) return { action: 'handoff', intent, reason: 'missing_data' }
  return { action: 'answer', intent, facts }
}

// ─── Answer phrasing (defence-in-depth) ───
// Phrases ONLY the resolved facts in a friendly WhatsApp tone. The system prompt
// forbids adding anything beyond the facts, so even though it's an LLM it cannot
// answer from general knowledge. Degrades to returning the raw facts if the API
// is unavailable — still correct, just less polished.
export async function phraseAnswer(
  question: string,
  facts: string,
  programmeName: string,
): Promise<string> {
  if (!ANTHROPIC_API_KEY) return facts

  const system = `You are the assistant for "${programmeName}", replying to a parent in a WhatsApp group.

Answer the parent's question using ONLY the facts below. Do NOT add anything that is not in the facts — no advice, no assumptions, no extra detail, no general knowledge.

Facts:
${facts}

Rules:
- 1–2 short, warm sentences. WhatsApp tone. No sign-off.
- If the facts do not actually answer the question, reply EXACTLY: "Let me check that with the coach and come back to you."`

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
        max_tokens: 150,
        system,
        messages: [{ role: 'user', content: question.slice(0, 500) }],
      }),
    })
    if (!res.ok) return facts
    const data = await res.json()
    return (data.content?.[0]?.text || '').trim() || facts
  } catch {
    return facts
  }
}

// ─── Routing copy ───

export function buildHandoffMessage(coachName: string): string {
  const who = clean(coachName) || 'the coach'
  return `I can help with class times, prices, location, what to bring and booking. For anything else I'll pass you to ${who} — they'll come back to you directly.`
}

export function buildMissingDataMessage(coachName: string): string {
  const who = clean(coachName) || 'the coach'
  return `Good question — let me check that with ${who} and come back to you.`
}
