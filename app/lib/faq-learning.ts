// app/lib/faq-learning.ts
// Two halves of the coach-approved learning loop:
//   matchActiveFaq        — let the bot answer from the programme's APPROVED FAQs.
//   suggestFaqsForProgramme — draft FAQ suggestions from that programme's own chat
//                             history for the coach to approve.
//
// ISOLATION: everything here is scoped to a single programme_id. FAQs are read
// and written per-programme only; nothing is ever shared across programmes or
// coaches. SERVER-SIDE ONLY.

import { sql } from '@/app/lib/sql'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
const MODEL = 'claude-haiku-4-5-20251001'

async function callClaude(system: string, user: string, maxTokens: number): Promise<string> {
  if (!ANTHROPIC_API_KEY) return ''
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    })
    if (!res.ok) return ''
    const data = await res.json()
    return (data.content?.[0]?.text || '').trim()
  } catch {
    return ''
  }
}

// ── Bot side: match an incoming message to an APPROVED FAQ ──
// Returns the matching FAQ answer, or null. Conservative: only returns a match
// it's confident about, so the bot never invents or mis-applies an answer.
export async function matchActiveFaq(
  question: string,
  faqs: { q: string; a: string }[]
): Promise<{ q: string; a: string } | null> {
  if (!ANTHROPIC_API_KEY || faqs.length === 0 || !question.trim()) return null
  const menu = faqs.map((f, i) => `${i}. Q: ${f.q}`).join('\n')
  const system = `You match a parent's WhatsApp message to a coach-approved FAQ for their programme.

FAQs (by index):
${menu}

Return ONLY a single-line JSON object: {"index": <number>} where index is the FAQ that genuinely answers the message, or {"index": -1} if none clearly fits.
Rules:
- Only match when the FAQ truly answers what they asked. When unsure, return -1.
- Recognise loose/casual phrasings of the same question.`
  const raw = await callClaude(system, `Message: """${question.slice(0, 500)}"""\n\nReturn JSON now.`, 30)
  const m = raw.match(/\{[^}]*"index"\s*:\s*(-?\d+)[^}]*\}/)
  if (!m) return null
  const idx = parseInt(m[1], 10)
  return idx >= 0 && idx < faqs.length ? faqs[idx] : null
}

// ── Coach side: draft suggestions from this programme's chat history ──
// Reads the programme's own conversation log, extracts DURABLE Q&A the coach has
// answered, EXCLUDING one-off / time-bound exceptions, and inserts them as
// `pending_coach_approval` FAQs for review. Idempotent-ish (skips near-duplicates).
export async function suggestFaqsForProgramme(programmeId: string): Promise<{ added: number; reviewed: number }> {
  if (!ANTHROPIC_API_KEY) return { added: 0, reviewed: 0 }

  const { rows: convs } = await sql`
    SELECT sender_name, sender_type, message_text, bot_response
    FROM conversations
    WHERE programme_id = ${programmeId}
      AND created_at > NOW() - INTERVAL '60 days'
      AND message_text IS NOT NULL
    ORDER BY created_at ASC
    LIMIT 200
  `
  if (convs.length < 4) return { added: 0, reviewed: 0 }

  const transcript = convs
    .map((r) => {
      const who = r.sender_type === 'coach' ? 'COACH' : (r.sender_name || 'Parent')
      const botted = r.bot_response ? ` [bot replied]` : ''
      return `${who}: ${String(r.message_text).slice(0, 300)}${botted}`
    })
    .join('\n')
    .slice(0, 12000)

  // Existing questions for this programme (any status) — to avoid duplicates.
  const { rows: existing } = await sql`SELECT question FROM faqs WHERE programme_id = ${programmeId}`
  const existingSet = new Set(existing.map((e) => String(e.question || '').trim().toLowerCase()))

  const system = `You read a WhatsApp group transcript for ONE coaching programme and extract durable FAQ entries the COACH has answered, so they can be reused.

Return ONLY a JSON array (max 8) of {"q": "...", "a": "..."} — generalised question + a concise standing answer in the coach's voice.

CRITICAL rules:
- ONLY include durable, standing facts (things true week to week).
- EXCLUDE one-off / time-bound answers: anything tied to "this week", "today", a specific date, "just this time", or stated as an exception ("normally X but this week Y"). If an answer mixes a standing fact with a one-off, keep ONLY the standing part (e.g. "normally 6pm").
- Only include things the coach actually answered or stated. Do not invent.
- No personal data (no names, phone numbers, child details).
- If nothing qualifies, return [].`

  const raw = await callClaude(system, `Transcript:\n${transcript}\n\nReturn the JSON array now.`, 1200)
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) return { added: 0, reviewed: convs.length }

  let items: { q?: string; a?: string }[] = []
  try { items = JSON.parse(match[0]) } catch { return { added: 0, reviewed: convs.length } }

  let added = 0
  for (const it of items.slice(0, 8)) {
    const q = (it.q || '').trim()
    const a = (it.a || '').trim()
    if (q.length < 5 || a.length < 2) continue
    if (existingSet.has(q.toLowerCase())) continue
    try {
      await sql`
        INSERT INTO faqs (programme_id, question, answer, category, source, status)
        VALUES (${programmeId}, ${q}, ${a}, 'learned', 'learned', 'pending_coach_approval')
      `
      existingSet.add(q.toLowerCase())
      added++
    } catch (e) {
      console.error('[faq-learning] insert failed:', e)
    }
  }
  return { added, reviewed: convs.length }
}
