// app/lib/ai-messages.ts
// Generate WhatsApp-ready messages for the Coach Control Centre.
// Uses Claude Haiku 4.5 via raw fetch (matches existing webhook pattern).
// SERVER-SIDE ONLY.

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
const MODEL = 'claude-haiku-4-5-20251001'

interface ClaudeMessage {
  role: 'user' | 'assistant'
  content: string
}

async function callClaude(systemPrompt: string, messages: ClaudeMessage[], maxTokens = 200): Promise<string> {
  // Hard timeout so a slow/overloaded Anthropic can never hang the WhatsApp
  // webhook into silence — the caller catches and falls back to a safe reply.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 9000)
  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages,
      }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Claude API error ${res.status}: ${body}`)
  }

  const data = await res.json()
  return data.content?.[0]?.text?.trim() || ''
}

// ─── Promotion messages ───

export interface PromotionInput {
  promotionType: 'social_event' | 'refer_a_friend' | 'holiday_camp' | 'other'
  title?: string | null
  detail: string
  startAt?: string | null
  endAt?: string | null
  venue?: string | null
  costGbp?: number | null
  isFree?: boolean
  paymentLink?: string | null
  coachName: string
  programmeName: string
  referralLink?: string | null
}

export async function generatePromotionMessage(input: PromotionInput): Promise<string> {
  const systemPrompt = `You write short WhatsApp messages for youth sports coaches to post in their parent groups.

Rules:
- Warm coach voice, not corporate. Write like a real person.
- 2-4 sentences maximum plus a clear call to action.
- Use at most ONE emoji, placed naturally.
- No hashtags. No "Dear parents" or formal openings. Just dive in.
- Include all the essential details (date, time, venue, cost) but don't list them robotically.
- End with a clear next step: reply, book, click link, share, etc.
- British English. "Programme" not "program".`

  const details: string[] = []
  details.push(`Programme: ${input.programmeName}`)
  details.push(`Coach: ${input.coachName}`)
  details.push(`Promotion type: ${input.promotionType.replace(/_/g, ' ')}`)
  if (input.title) details.push(`Title: ${input.title}`)
  details.push(`Details: ${input.detail}`)
  if (input.startAt) details.push(`Starts: ${input.startAt}`)
  if (input.endAt) details.push(`Ends: ${input.endAt}`)
  if (input.venue) details.push(`Venue: ${input.venue}`)
  if (input.isFree) {
    details.push(`Cost: Free`)
  } else if (input.costGbp) {
    details.push(`Cost: £${input.costGbp.toFixed(2)}`)
  }
  if (input.paymentLink) details.push(`Booking link: ${input.paymentLink}`)
  if (input.referralLink) details.push(`Referral link: ${input.referralLink}`)

  let cta = ''
  switch (input.promotionType) {
    case 'refer_a_friend':
      cta = 'Call to action: encourage forwarding to a friend and clicking the referral link.'
      break
    case 'social_event':
      cta = 'Call to action: RSVP by replying to this message.'
      break
    case 'holiday_camp':
      cta = 'Call to action: book a spot via the link.'
      break
    default:
      cta = 'Call to action: reply for more info or use the booking link if provided.'
  }

  const userMsg = `Write the WhatsApp message now.\n\n${details.join('\n')}\n\n${cta}`

  return callClaude(systemPrompt, [{ role: 'user', content: userMsg }], 250)
}

// ─── Poll prompt (the outbound message announcing a poll) ───

export interface PollPromptInput {
  question: string
  options: string[]
  closesAt?: string | null
  coachName: string
  programmeName: string
}

export async function generatePollMessage(input: PollPromptInput): Promise<string> {
  const systemPrompt = `You write short WhatsApp messages to introduce a poll.

Rules:
- Warm coach voice, not corporate. 1-2 sentences intro then list the options.
- List options with letter labels (a, b, c...) so parents can reply with a single letter.
- If a close time is given, mention it at the end.
- One emoji max. British English.`

  const lettered = input.options
    .map((opt, i) => `${String.fromCharCode(97 + i)}) ${opt}`)
    .join('\n')

  const parts = [
    `Programme: ${input.programmeName}`,
    `Coach: ${input.coachName}`,
    `Question: ${input.question}`,
    `Options:\n${lettered}`,
  ]
  if (input.closesAt) parts.push(`Closes: ${input.closesAt}`)

  const userMsg = `Write the WhatsApp poll message now.\n\n${parts.join('\n')}`

  return callClaude(systemPrompt, [{ role: 'user', content: userMsg }], 200)
}

// ─── Fixture announcement ───

export interface FixtureInput {
  fixtureType: string
  opposition?: string | null
  homeAway?: 'home' | 'away' | null
  kickoffAt: string
  meetAt?: string | null
  venue?: string | null
  kitNotes?: string | null
  coachName: string
  programmeName: string
}

export async function generateFixtureMessage(input: FixtureInput): Promise<string> {
  const systemPrompt = `You write short WhatsApp fixture announcements for youth sports teams.

Rules:
- Warm coach voice. 2-4 sentences.
- Lead with: what (match type), who (opposition, home/away), when (kick-off), where.
- Then: meet time, kit notes.
- Sign off with motivation or reply prompt.
- One emoji max. British English.`

  const parts = [
    `Programme: ${input.programmeName}`,
    `Coach: ${input.coachName}`,
    `Type: ${input.fixtureType}`,
    `Opposition: ${input.opposition || 'TBC'}`,
    `Home/Away: ${input.homeAway || 'unknown'}`,
    `Kick-off: ${input.kickoffAt}`,
  ]
  if (input.meetAt) parts.push(`Meet at: ${input.meetAt}`)
  if (input.venue) parts.push(`Venue: ${input.venue}`)
  if (input.kitNotes) parts.push(`Kit: ${input.kitNotes}`)

  return callClaude(systemPrompt, [{ role: 'user', content: parts.join('\n') }], 250)
}

// ─── Cancellation message ───

export interface CancellationInput {
  sessionType: 'training' | 'fixture'
  date: string
  reason?: string | null
  rescheduleTo?: string | null
  coachName: string
  programmeName: string
}

export async function generateCancellationMessage(input: CancellationInput): Promise<string> {
  const systemPrompt = `You write short, warm WhatsApp cancellation messages.

Rules:
- Apologise briefly, state what's cancelled and when, give the reason if appropriate.
- If there's a reschedule, mention the new date clearly.
- 2-3 sentences max. One emoji max.
- British English.`

  const parts = [
    `Programme: ${input.programmeName}`,
    `Coach: ${input.coachName}`,
    `What: ${input.sessionType}`,
    `Originally on: ${input.date}`,
  ]
  if (input.reason) parts.push(`Reason: ${input.reason}`)
  if (input.rescheduleTo) parts.push(`Rescheduled to: ${input.rescheduleTo}`)

  return callClaude(systemPrompt, [{ role: 'user', content: parts.join('\n') }], 200)
}

// ─── Referral messages ───

export interface ReferralMessageInput {
  friendFirstName: string
  childName?: string | null
  programmeName: string
  coachName: string
  venue?: string | null
  firstSessionAt?: string | null
  referredByName?: string | null
}

/**
 * Confirmation message sent immediately after a friend submits the referral form.
 */
export async function generateReferralConfirmation(input: ReferralMessageInput): Promise<string> {
  const systemPrompt = `You write short WhatsApp messages welcoming new parents to a youth coaching programme.

Rules:
- Warm, welcoming, coach's voice.
- 2-3 sentences. One emoji max.
- Confirm you've got their details and briefly say what happens next (the coach will be in touch).
- British English.`

  const parts = [
    `Greet: ${input.friendFirstName}`,
    input.childName ? `Child: ${input.childName}` : '',
    `Programme: ${input.programmeName}`,
    `Coach: ${input.coachName}`,
    input.venue ? `Venue: ${input.venue}` : '',
    input.firstSessionAt ? `First session: ${input.firstSessionAt}` : '',
    input.referredByName ? `Referred by: ${input.referredByName}` : '',
  ].filter(Boolean)

  return callClaude(systemPrompt, [{ role: 'user', content: parts.join('\n') }], 200)
}

export type NudgeStep =
  | 'pre_session'
  | 'session_day'
  | 'post_session'           // T+24h post-attend conversion CTA
  | 'conversion_followup'    // T+72h post-attend second nudge
  | 'conversion_final'       // T+7d post-attend final nudge (caller flips status to lapsed)
  | 'lapsed_check'           // legacy: 7d after creation when never attended

/**
 * Nudge messages at various points in the referral journey.
 */
export async function generateReferralNudge(
  step: NudgeStep,
  input: ReferralMessageInput
): Promise<string> {
  const intents: Record<NudgeStep, string> = {
    pre_session: 'Friendly reminder that their first session is tomorrow. Include what to bring if obvious.',
    session_day: 'Quick "see you today" with venue and time. One sentence + emoji.',
    post_session: 'They came along to their first session yesterday and had a great time. Invite them to book their next session and secure the spot. Mention a booking link will follow.',
    conversion_followup: 'Three days since their first session and they haven\'t booked yet. Gentle nudge that spots are limited and to secure their place. Friendly, not pushy.',
    conversion_final: 'A week since their first session — last chance to book before we close their slot. Warm tone, not aggressive. Short.',
    lapsed_check: "Gentle check-in after 7 days of no response — would they still like to come along? Don't be pushy.",
  }

  const systemPrompt = `You write short WhatsApp nudge messages to parents considering joining a youth coaching programme.

Rules:
- Warm, personal, coach's voice (not marketing).
- 1-3 sentences. One emoji max.
- No "Dear Mr/Mrs" openings.
- British English.
- Don't be pushy — this is a referral, not a cold outreach.

Intent for this message: ${intents[step]}`

  const parts = [
    `Parent first name: ${input.friendFirstName}`,
    input.childName ? `Child's name: ${input.childName}` : '',
    `Programme: ${input.programmeName}`,
    `Coach: ${input.coachName}`,
    input.venue ? `Venue: ${input.venue}` : '',
    input.firstSessionAt ? `First session: ${input.firstSessionAt}` : '',
  ].filter(Boolean)

  return callClaude(systemPrompt, [{ role: 'user', content: parts.join('\n') }], 200)
}

// ─── Day-before session reminder ───
// Sent direct to the coach (not the group) the day before each scheduled
// training/fixture, with a quick attendance summary from the latest poll.

export interface SessionReminderInput {
  coachFirstName: string
  programmeName: string
  sessionTitle: string | null              // 'Training' | 'Match vs ...'
  startsAtLocal: string                    // 'Tomorrow at 17:30' (formatted upstream)
  venue: string | null
  attendance: {
    yes: number
    no: number
    maybe: number
    pending: number                        // members who haven't replied
    pollQuestion: string | null            // null when no recent poll
  }
}

export async function generateSessionReminder(input: SessionReminderInput): Promise<string> {
  const systemPrompt = `You write short heads-up messages from an AI assistant to a youth-sports coach.

Rules:
- Warm, brief, addressed to the coach by first name.
- 2-3 sentences max. One emoji max.
- British English.
- Lead with the session, then attendance.
- If there's no poll data, don't pretend there is — say "no poll yet for this session" or similar.
- Never make up numbers.`

  const a = input.attendance
  const hasPoll = !!a.pollQuestion && (a.yes + a.no + a.maybe + a.pending) > 0
  const attendanceLine = hasPoll
    ? `Latest poll "${a.pollQuestion}": ${a.yes} yes, ${a.no} no, ${a.maybe} maybe, ${a.pending} not yet replied.`
    : 'No poll has been sent for this session yet.'

  const parts = [
    `Coach first name: ${input.coachFirstName}`,
    `Programme: ${input.programmeName}`,
    `Session: ${input.sessionTitle || 'Training'}`,
    `When: ${input.startsAtLocal}`,
    input.venue ? `Venue: ${input.venue}` : '',
    attendanceLine,
  ].filter(Boolean)

  return callClaude(systemPrompt, [{ role: 'user', content: parts.join('\n') }], 200)
}

// ─── Post-session feedback (fitness studio vertical) ───
// Three short DMs the bot sends to a client after a session. Trigger flow
// is in app/api/webhooks/whatsapp/route.ts.

export interface FeedbackPromptInput {
  clientFirstName: string
  programmeName: string
  ptName: string | null         // null when no specific PT (e.g. group class)
  sessionDate: string | null    // 'today' | 'yesterday' | 'on Monday' — formatted upstream
}

export async function generateFeedbackPrompt(input: FeedbackPromptInput): Promise<string> {
  const systemPrompt = `You write very short post-session feedback prompts that go via WhatsApp 1:1 to a fitness-studio client.

Rules:
- 1-2 sentences max. One emoji max.
- Address the client by first name.
- Ask them to rate the session 1-5.
- Make it clear they should reply with just a number.
- British English.
- Don't pretend to be human — concise and friendly is enough.`

  const parts = [
    `Client first name: ${input.clientFirstName}`,
    `Programme/class: ${input.programmeName}`,
    input.ptName ? `Trainer: ${input.ptName}` : '',
    input.sessionDate ? `Session: ${input.sessionDate}` : 'Session: today',
  ].filter(Boolean)

  return callClaude(systemPrompt, [{ role: 'user', content: parts.join('\n') }], 150)
}

export interface FeedbackFollowUpInput {
  clientFirstName: string
  score: number                   // 1-5
}

// Sent after the score is recorded. Two flavours: low (1-2) asks for written
// feedback to flag to the manager; high (4-5) thanks + transitions into the
// referral pitch. Score 3 gets a plain thank-you with no follow-up.
export async function generateFeedbackFollowUp(input: FeedbackFollowUpInput): Promise<string> {
  let intent: string
  if (input.score <= 2) {
    intent = 'Acknowledge the low score warmly. Ask if they would like to share any feedback for the manager (confidential). 1-2 sentences. No platitudes.'
  } else if (input.score >= 4) {
    intent = 'Thank them. Mention that if they have a friend who would enjoy training there, you have something for them — would they like to hear about it? 1-2 sentences. One emoji max.'
  } else {
    intent = 'Plain thank-you for the feedback, one short sentence, no follow-up question.'
  }

  const systemPrompt = `You write a short WhatsApp 1:1 reply from a fitness-studio bot to a client who has just rated their session.

Rules:
- 1-2 sentences max. One emoji max.
- Use the client's first name.
- British English.

Intent for this reply: ${intent}`

  const parts = [
    `Client first name: ${input.clientFirstName}`,
    `Score they gave: ${input.score}/5`,
  ]

  return callClaude(systemPrompt, [{ role: 'user', content: parts.join('\n') }], 150)
}

// Sent on referral-handoff after a high score: "yes, send me the link" path.
// Plain template (no LLM cost) so the link lands intact and consistent.
export function buildReferralHandoffMessage(referLink: string, clientFirstName: string): string {
  return `Brilliant ${clientFirstName} — here's your link to share with a friend:\n${referLink}\n\nWhen they sign up through it, you'll both get the bonus.`
}

// Sent when the client declines the referral pitch. Plain template.
export function buildReferralDeclineAck(clientFirstName: string): string {
  return `No worries ${clientFirstName} — thanks again for the feedback. See you at the next session 💪`
}

// Sent to the referrer when the coach issues a free-class credit because
// their referred friend's child attended a session. Plain template so the
// numbers + wording land identical every time.
export function buildReferralCreditIssuedMessage(input: {
  referrerFirstName: string
  refereeChildName: string | null
  newBalance: number
}): string {
  const subject = input.refereeChildName ? input.refereeChildName : 'your friend'
  const balanceLine = input.newBalance > 1
    ? `You now have ${input.newBalance} free class credits to use on a future booking.`
    : `You now have 1 free class credit to use on a future booking.`
  return `Thanks for the referral ${input.referrerFirstName}! ${subject} came along and earned you a free class 🙌\n\n${balanceLine}`
}

// ─── Holiday camp bookings (WhatsApp-native flow) ───

interface CampDayLite {
  date: string         // 'YYYY-MM-DD'
  label: string        // 'Tue 7 Apr'
  price_gbp: number
  capacity?: number | null
}

// Outbound invite addressed to one parent for one child. Lettered list so
// parents can reply with letters, day labels, dates, "all", etc — the
// parser handles all of it.
export interface CampInviteInput {
  parentFirstName: string
  childName: string
  campTitle: string | null
  campDetail: string
  dayList: CampDayLite[]
  coachName: string
  paymentLink?: string | null
}

export async function generateCampInviteMessage(input: CampInviteInput): Promise<string> {
  const systemPrompt = `You write short, warm WhatsApp messages for a sports/fitness coach inviting a parent to book their child onto a holiday camp.

Rules:
- Coach voice, not corporate. Greet the parent by first name.
- 2-3 short paragraphs max. Mention the child by name.
- List the available days with letter labels (a, b, c, ...) so the parent can reply with letters (e.g. "a, b" or "Tue & Wed") to pick which ones they want.
- Ask them to reply with their day selection. Mention they can pick any combination, or reply "all" for every day.
- Do not mention payment yet — payment instructions come AFTER they've picked days.
- One emoji max. British English.`

  const lettered = input.dayList
    .map((d, i) => `${String.fromCharCode(97 + i)}) ${d.label} — £${Number(d.price_gbp).toFixed(2)}`)
    .join('\n')

  const parts = [
    `Parent first name: ${input.parentFirstName || 'there'}`,
    `Child name: ${input.childName}`,
    `Coach: ${input.coachName}`,
    `Camp title: ${input.campTitle || '(no title)'}`,
    `Camp details: ${input.campDetail}`,
    `Available days:\n${lettered}`,
  ]

  return callClaude(systemPrompt, [{ role: 'user', content: `Write the WhatsApp invite now.\n\n${parts.join('\n')}` }], 350)
}

// Deterministic fast-path for the documented happy path ("reply with the
// letters, e.g. 'a c'"). Handles letters (a, A, "a c", "a, c", "a and c",
// compact "ac"), "all"/"every day", and plain day numbers ("1", "1 3"). Returns
// the 0-based indices, or null when it can't confidently parse — in which case
// the caller falls back to the LLM parser for natural language / dates.
// No network, so a single letter ALWAYS gets an instant, reliable response.
export function parseCampDayLetters(reply: string, dayCount: number): number[] | null {
  const t = (reply || '').trim().toLowerCase()
  if (!t || dayCount <= 0) return null

  if (/\b(all|every ?day|the lot|all of them|everything|each day|whole week)\b/.test(t)) {
    return Array.from({ length: dayCount }, (_, i) => i)
  }

  const picked = new Set<number>()

  // Letter tokens with boundaries: "a", "a c", "a, c", "a and c".
  for (const m of t.matchAll(/\b([a-z])\b/g)) {
    const idx = m[1].charCodeAt(0) - 97
    if (idx >= 0 && idx < dayCount) picked.add(idx)
  }

  // Compact run of valid day letters with no separators, e.g. "ac", "abc".
  if (picked.size === 0 && /^[a-z]+$/.test(t) && t.length <= dayCount) {
    let ok = true
    for (const ch of t) {
      const idx = ch.charCodeAt(0) - 97
      if (idx >= 0 && idx < dayCount) picked.add(idx)
      else { ok = false; break }
    }
    if (!ok) picked.clear()
  }

  // Plain option numbers ("1", "1 3") — only small ones that map to a day, so we
  // don't misread a date like "20 July". Skip if the text also has month words.
  if (picked.size === 0 && !/[a-z]/.test(t.replace(/(st|nd|rd|th)\b/g, ''))) {
    for (const m of t.matchAll(/\b(\d{1,2})\b/g)) {
      const n = parseInt(m[1], 10)
      if (n >= 1 && n <= dayCount) picked.add(n - 1)
    }
  }

  return picked.size ? Array.from(picked).sort((a, b) => a - b) : null
}

// Free-text → array of day-list indices (0-based). Uses Claude in
// JSON-only mode. Examples it should handle:
//   "a, b"          → [0,1]
//   "Tuesday & Wednesday" → [0,1]   (if those map to a, b)
//   "7 and 8"       → [0,1]
//   "all"           → [0,1,2,...]
//   "just Wednesday" → [1]
//   "thx" / random → null
// Returns null on unparseable.
export async function parseCampDaySelection(
  reply: string,
  dayList: CampDayLite[]
): Promise<number[] | null> {
  const lettered = dayList
    .map((d, i) => `  ${String.fromCharCode(97 + i)} (index ${i}) = ${d.label} on ${d.date}`)
    .join('\n')

  const systemPrompt = `You parse a parent's WhatsApp reply selecting which holiday-camp days they want.

You will be given:
- The list of available days with letter labels and 0-based indices.
- The parent's reply text.

Return ONLY a single JSON object on one line, no prose, no markdown, no code fences. Schema:
  {"indices":[0,1]}   — the 0-based indices of the days they picked
  {"indices":[]}      — if the reply is unparseable or doesn't pick any days

Interpretation rules:
- "all", "every day", "the lot", "yes all of them" → all indices
- Letter references ("a", "b and c") → corresponding indices
- Day-of-week references ("Tuesday", "Tue") → match against the label
- Date references ("7th", "the 7th", "April 7") → match against the date or label
- "just X" / "only X" / "X only" → just that one index
- Random non-selection text ("ok", "thanks", "?", "hi") → empty array
- Be liberal: accept misspellings, mixed formats, ranges ("a to c" → 0,1,2)
- Never invent indices outside the provided range.`

  const userMsg = `Available days:\n${lettered}\n\nParent's reply: "${reply}"\n\nReturn JSON now.`

  const raw = await callClaude(systemPrompt, [{ role: 'user', content: userMsg }], 100)
  // Extract the first JSON object — be tolerant if the model wrapped it.
  const match = raw.match(/\{[^}]*"indices"\s*:\s*\[[^\]]*\][^}]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0])
    if (!Array.isArray(parsed.indices)) return null
    const indices = parsed.indices
      .map((x: unknown) => (typeof x === 'number' ? Math.floor(x) : parseInt(String(x), 10)))
      .filter((n: number) => Number.isInteger(n) && n >= 0 && n < dayList.length)
    return indices.length > 0 ? indices : null
  } catch {
    return null
  }
}

// Plain template (no LLM cost) — payment instructions need to land
// verbatim with the link intact, no creative liberties.
export function buildCampPaymentInstructions(input: {
  parentFirstName: string
  childName: string
  selectedDays: CampDayLite[]
  total: number
  paymentLink: string | null
  paymentReference: string
}): string {
  const daysLine = input.selectedDays.map((d) => d.label).join(', ')
  const greeting = input.parentFirstName ? `Brilliant ${input.parentFirstName}` : 'Brilliant'
  const lines: string[] = []
  lines.push(`${greeting} — ${input.childName} is booked in for: ${daysLine}.`)
  lines.push('')
  lines.push(`Total: £${input.total.toFixed(2)}`)
  if (input.paymentLink) {
    lines.push(`Pay here: ${input.paymentLink}`)
  }
  lines.push(`Please use reference: ${input.paymentReference}`)
  lines.push('')
  lines.push(`Once you've paid, reply "PAID" and I'll let the coach know 👍`)
  return lines.join('\n')
}

// Sent after parent replies "PAID". Plain template.
export function buildCampPaidAck(input: {
  parentFirstName: string
  childName: string
  total: number
}): string {
  const name = input.parentFirstName ? ` ${input.parentFirstName}` : ''
  return `Thanks${name} — I've flagged £${input.total.toFixed(2)} for ${input.childName} as paid. The coach will confirm receipt against the bank shortly.`
}

// Richer WhatsApp "thank-you / payment received" follow-up sent the moment the
// parent reports payment — itemised so it reads like a receipt. Replaces the email.
// Carries the coach-will-confirm wording AND the GDPR notice (per the spec).
export function buildCampPaymentReceived(input: {
  parentFirstName: string | null
  children: CampChildSummary[]
  campName: string
  coachName?: string | null
}): string {
  const total = input.children.reduce((s, c) => s + c.total, 0)
  const name = input.parentFirstName ? ` ${input.parentFirstName}` : ''
  const who = input.coachName && input.coachName.trim() ? input.coachName.trim() : 'The coach'
  const lines = input.children.map(
    (c) => `• ${c.childName}${c.age != null ? ` (age ${c.age})` : ''} — ${c.dayLabels.join(', ')} — £${c.total.toFixed(2)}`
  )
  return (
    `Thank you${name}! 🙌 I've got your payment details for ${input.campName}:\n\n` +
    `${lines.join('\n')}\n\nTotal: £${total.toFixed(2)}\n\n` +
    `${who} will confirm your payment in due course. Thanks for your booking!\n\n` +
    `🔒 We only use your details to manage this booking and contact you about the camp, in line with UK GDPR — we never share them with anyone else. Reply STOP to opt out of promotional messages at any time.`
  )
}

// Sent when we can't parse the parent's day-selection reply.
export function buildCampDayUnparseableNudge(childName: string, dayList: CampDayLite[]): string {
  const lettered = dayList
    .map((d, i) => `${String.fromCharCode(97 + i)}) ${d.label}`)
    .join('\n')
  return `Sorry, didn't catch which days you'd like for ${childName}. Please reply with the letters (e.g. "a, b") or day names from the list below — or "all" for every day.\n\n${lettered}`
}

// ─── Camp 1:1 conversation (revised spec) — pure message builders ───
// All deterministic templates (no LLM) so they're cheap and unit-testable.

export interface CampDayAvailLite {
  index: number
  label: string
  price_gbp: number
  remaining: number | null   // null = uncapped
}

export interface CampChildSummary {
  childName: string
  age: number | null
  dayLabels: string[]
  total: number
}

// Message 1 — opening. If the parent's name is unknown, ask for it first.
export function buildCampOpening(campName: string, parentFirstName: string | null): string {
  if (!parentFirstName) {
    return `Hi! 👋 Great that you're interested in ${campName}.\n\nLet me get your child booked in — takes about a minute. First, what's your name?`
  }
  return `Hey ${parentFirstName}! 👋 Great that you're interested in ${campName}.\n\nLet me get your child booked in — takes about a minute.\n\nWhat's your child's first name?`
}

// Message 1b — when a group has more than one bookable camp (e.g. a July and an
// August week), the parent picks which one before we collect any details.
export function buildCampChoice(
  camps: { title: string | null; dateLabel?: string | null }[],
  parentFirstName: string | null
): string {
  const greeting = parentFirstName ? `Hi ${parentFirstName}! 👋` : 'Hi! 👋'
  // If two camps share a title, append their dates so they're distinguishable.
  const titleCounts = new Map<string, number>()
  for (const c of camps) {
    const k = (c.title || '').trim().toLowerCase()
    titleCounts.set(k, (titleCounts.get(k) || 0) + 1)
  }
  const lines = camps.map((c, i) => {
    const title = c.title || `Camp ${i + 1}`
    const dupTitle = (titleCounts.get((c.title || '').trim().toLowerCase()) || 0) > 1
    const suffix = dupTitle && c.dateLabel ? ` — ${c.dateLabel}` : ''
    return `${i + 1}️⃣ ${title}${suffix}`
  })
  return `${greeting} We've got more than one camp coming up — which would you like to book?\n\n${lines.join('\n')}\n\nJust reply with the number.`
}

// Parse a camp-choice reply: a 1-based number ("1", "2)", "option 2"), a letter
// ("a"/"b"), or a clear match on the camp's title / month name. Returns the index
// into `camps`, or null when it can't tell confidently.
export function parseCampChoice(
  text: string,
  camps: { title: string | null; dateLabel?: string | null }[]
): number | null {
  const t = (text || '').trim().toLowerCase()
  if (!t || camps.length === 0) return null

  // Numeric pick (1..N).
  const num = t.match(/\b([1-9])\b/)
  if (num) {
    const idx = parseInt(num[1], 10) - 1
    if (idx >= 0 && idx < camps.length) return idx
  }
  // Letter pick (a/b/c…), only as a bare leading token.
  const letter = t.match(/^([a-z])\b/)
  if (letter) {
    const idx = letter[1].charCodeAt(0) - 97
    if (idx >= 0 && idx < camps.length) return idx
  }
  // Title / month substring match — match against the title AND the date label
  // (months often live in the dates), and only accept when EXACTLY one matches.
  const matches: number[] = []
  camps.forEach((c, i) => {
    const hay = `${c.title || ''} ${c.dateLabel || ''}`.toLowerCase().trim()
    if (!hay) return
    const title = (c.title || '').toLowerCase()
    if ((title && t.includes(title)) || (t.length >= 3 && hay.includes(t))) { matches.push(i); return }
    const months = hay.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/g) || []
    if (months.some((m) => t.includes(m))) matches.push(i)
  })
  return matches.length === 1 ? matches[0] : null
}

export function buildCampAskChildName(parentFirstName: string | null): string {
  const name = parentFirstName ? ` ${parentFirstName}` : ''
  return `Lovely to meet you${name}! And what's your child's first name?`
}

export function buildCampAskAge(childName: string): string {
  return `Nice! How old is ${childName}?`
}

export function buildCampAgeRetry(childName: string): string {
  return `Just to check — how old is ${childName} in years? (a number between 4 and 17)`
}

// Message 3 — day selection. Only days with capacity are passed in.
export function buildCampDaySelection(childName: string, campName: string, availableDays: CampDayAvailLite[]): string {
  const lines = availableDays.map((d) => {
    const letter = String.fromCharCode(97 + d.index)
    const spots = d.remaining != null ? ` (${d.remaining} spot${d.remaining === 1 ? '' : 's'} left)` : ''
    return `${letter}) ${d.label} — £${Number(d.price_gbp).toFixed(2)}${spots}`
  })
  return `Great! Here are the available days for ${campName}:\n\n${lines.join('\n')}\n\nWhich days would you like ${childName} to attend? Reply with the letters, e.g. "a c" for the first and third.`
}

export function buildCampAllFull(campName: string): string {
  return `Sorry — ${campName} is fully booked right now. Want me to add you to the waitlist? Reply "yes" and I'll let you know the moment a spot opens up.`
}

export function buildCampDayJustFilled(filledLabel: string, stillAvailable: CampDayAvailLite[]): string {
  if (stillAvailable.length === 0) {
    return `Sorry — ${filledLabel} just filled up, and the rest of the camp is now full too. I can add you to the waitlist if you'd like — reply "yes".`
  }
  const lines = stillAvailable.map((d) => `${String.fromCharCode(97 + d.index)}) ${d.label}`).join('\n')
  return `Sorry — ${filledLabel} just filled up since you started! These are still available:\n\n${lines}\n\nWhich would you like? Reply with the letters.`
}

// Message 4 — checkout recap. Handles single and multiple children.
export function buildCampCheckoutRecap(children: CampChildSummary[]): string {
  const grandTotal = children.reduce((s, c) => s + c.total, 0)
  if (children.length === 1) {
    const c = children[0]
    const ageBit = c.age != null ? ` (age ${c.age})` : ''
    const daysLine = c.dayLabels.join(' + ')
    const n = c.dayLabels.length
    return `Here's what I've got:\n\n👦 ${c.childName}${ageBit}\n📅 ${daysLine}\n💰 ${n} day${n === 1 ? '' : 's'} = £${c.total.toFixed(2)}\n\nDoes that look right? Reply "yes" to get the payment link, "add" to book another child, or "change" to update anything.`
  }
  const lines = children.map((c) => {
    const ageBit = c.age != null ? ` (age ${c.age})` : ''
    return `• ${c.childName}${ageBit} — ${c.dayLabels.join(' + ')} — £${c.total.toFixed(2)}`
  })
  return `Here's your booking:\n\n${lines.join('\n')}\n\nTotal: £${grandTotal.toFixed(2)}\n\nReply "yes" for the payment link, "add" to book another child, or "change" to update anything.`
}

// Message 5 — combined payment link (single or multiple children).
export function buildCampPaymentMessage(input: {
  children: CampChildSummary[]
  paymentLink: string | null
  paymentReference: string
  campName: string
}): string {
  const total = input.children.reduce((s, c) => s + c.total, 0)
  const names = input.children.map((c) => c.childName).join(' & ')
  const lines: string[] = []
  lines.push(`Here's your payment link:`)
  lines.push('')
  lines.push(`£${total.toFixed(2)} for ${names} — ${input.campName}`)
  if (input.paymentLink) {
    lines.push('')
    lines.push(input.paymentLink)
  }
  lines.push('')
  lines.push(`Please use "${input.paymentReference}" as the payment reference.`)
  lines.push('')
  lines.push(`Once you've paid, reply "done" and I'll confirm your spot${input.children.length === 1 ? '' : 's'}.`)
  return lines.join('\n')
}

// Sent when the parent messages while we're waiting on the coach to confirm.
export function buildCampWaitingOnCoach(coachName: string | null): string {
  const who = coachName && coachName.trim() ? coachName.trim() : 'the coach'
  return `You're all set on my end — I'm just waiting for ${who} to confirm your payment. You'll get a confirmation here as soon as that's done 👍`
}

// Message 8 — booking confirmed (sent after coach confirms). One per group.
export function buildCampConfirmed(input: {
  children: CampChildSummary[]
  venue: string | null
}): string {
  const total = input.children.reduce((s, c) => s + c.total, 0)
  const lines: string[] = []
  lines.push(`All booked! ✓`)
  lines.push('')
  for (const c of input.children) {
    lines.push(`${c.childName} is confirmed for:`)
    for (const d of c.dayLabels) lines.push(`📅 ${d}`)
  }
  if (input.venue && input.venue.trim()) {
    lines.push('')
    lines.push(`📍 ${input.venue.trim()}`)
  }
  lines.push(`💰 £${total.toFixed(2)} — payment received`)
  lines.push('')
  lines.push(`What to bring: comfy kit, trainers, a water bottle and a packed lunch.`)
  lines.push('')
  lines.push(`See you there! 💪`)
  return lines.join('\n')
}

// Reject — coach flags a payment issue.
export function buildCampRejected(coachName: string | null): string {
  const who = coachName && coachName.trim() ? coachName.trim() : 'the coach'
  return `There's a small issue with the payment — ${who} will be in touch shortly to sort it out. 🙏`
}

// ─── Pure parsers for the camp conversation ───

// Extract a plausible child age (4–17) from a free-text reply.
export function parseCampAge(text: string): number | null {
  const m = text.match(/\b(\d{1,2})\b/)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return n >= 4 && n <= 17 ? n : null
}

export type CheckoutReply = 'confirm' | 'change' | 'add' | 'unknown'

// Classify the reply to the checkout recap.
export function parseCheckoutReply(text: string): CheckoutReply {
  const t = text.trim().toLowerCase()
  if (!t) return 'unknown'
  if (/\b(add|another|more|second child|sibling|also)\b/.test(t)) return 'add'
  if (/\b(change|wrong|edit|update|amend|no\b|incorrect|not right)\b/.test(t)) return 'change'
  if (/\b(yes|yep|yeah|yes please|correct|looks good|that's right|thats right|perfect|👍|confirm|go ahead|send)\b/.test(t) || t === 'y' || t === '✅') return 'confirm'
  return 'unknown'
}

// Affirmative yes (used for waitlist offers etc).
export function parseAffirmative(text: string): boolean {
  const t = text.trim().toLowerCase()
  return /^(y|yes|yep|yeah|yes please|ok|okay|sure|go on|please|👍|✅)\b/.test(t) || t === '👍' || t === '✅'
}

// Explicit "no / not yet".
export function parseNegative(text: string): boolean {
  const t = text.trim().toLowerCase()
  return /^(n|no|nope|not yet|not now|later|maybe later|not right now|nah)\b/.test(t) || t === '❌'
}

// Reply to the "ready to pay & confirm? (Yes / No / Amend)" reminder.
export type ReminderReply = 'yes' | 'no' | 'amend' | 'unknown'
export function parseReminderReply(text: string): ReminderReply {
  const t = text.trim().toLowerCase()
  if (!t) return 'unknown'
  if (/\b(amend|change|edit|update|different|swap|adjust)\b/.test(t)) return 'amend'
  if (parseAffirmative(t)) return 'yes'
  if (parseNegative(t)) return 'no'
  return 'unknown'
}

// ─── "Ready to pay now?" gate + remind-in-a-few-days flow ───

export function buildCampAskPaymentReady(): string {
  return `Brilliant — that's everything I need! 🙌\n\nAre you ready to make payment now to confirm the spot? (Yes / No)`
}
export function buildCampAskRemindConsent(): string {
  return `No problem at all! Shall I give you a nudge in a few days? (Yes / No)`
}
export function buildCampRemindSetAck(): string {
  return `Great — I'll check back in with you in a few days. 👍\n\nIf you'd like to go ahead sooner, just message me here anytime.`
}
export function buildCampSnoozeAck(): string {
  return `No worries — just message me here whenever you're ready and I'll get you booked in. 👍`
}

// The 72h reminder (sent by the chase cron). Itemised so they know what they're confirming.
export function buildCampReminder(input: { children: CampChildSummary[]; campName: string }): string {
  const total = input.children.reduce((s, c) => s + c.total, 0)
  const lines = input.children.map(
    (c) => `• ${c.childName}${c.age != null ? ` (age ${c.age})` : ''} — ${c.dayLabels.join(', ')} — £${c.total.toFixed(2)}`
  )
  return (
    `Hi! Just checking back in 👋 Are you ready to make payment and confirm your spot for ${input.campName}?\n\n` +
    `${lines.join('\n')}\nTotal: £${total.toFixed(2)}\n\n` +
    `Reply *Yes* to go ahead, *No* if not yet, or *Amend* to change the days.`
  )
}

// ─── Sign-up details collected before payment ───

export function buildCampAskRegName(childName: string): string {
  return `Almost there! Before I send the payment link I just need a few details to register ${childName}.\n\nWhat's the parent/guardian's full name?`
}
export function buildCampAskRegEmail(): string {
  return `Thanks! What's the best email for your booking confirmation?`
}
export function buildCampAskRegPhone(): string {
  return `And a contact phone number?`
}
export function buildCampRegEmailRetry(): string {
  return `Hmm, that doesn't look like an email address — could you send it again? (e.g. you@example.com)`
}
export function buildCampRegPhoneRetry(): string {
  return `Could you send a contact number for the booking? (just the digits is fine)`
}

// Accept a reasonable email. Deliberately lenient.
export function isValidEmail(text: string): string | null {
  const m = text.trim().match(/[^\s@]+@[^\s@]+\.[^\s@]+/)
  return m ? m[0] : null
}
// Pull a usable phone number (>=7 digits) from free text.
export function parsePhoneNumber(text: string): string | null {
  const digits = text.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '')
  const justDigits = digits.replace(/\D/g, '')
  return justDigits.length >= 7 ? digits : null
}

// Thank-you email sent as soon as the parent reports payment.
export function buildCampThankYouEmail(input: {
  parentFirstName: string | null
  children: CampChildSummary[]
  campName: string
  venue: string | null
}): { subject: string; text: string; html: string } {
  const total = input.children.reduce((s, c) => s + c.total, 0)
  const hi = input.parentFirstName ? `Hi ${input.parentFirstName},` : 'Hi there,'
  const lines = input.children.map((c) => `• ${c.childName}${c.age != null ? ` (age ${c.age})` : ''} — ${c.dayLabels.join(', ')} — £${c.total.toFixed(2)}`)
  const venueLine = input.venue && input.venue.trim() ? `\nVenue: ${input.venue.trim()}` : ''
  const subject = `Thanks — your ${input.campName} booking`
  const text =
    `${hi}\n\nThanks for booking onto ${input.campName}! We've received your payment details and the coach will confirm your place shortly.\n\n` +
    `${lines.join('\n')}\n\nTotal: £${total.toFixed(2)}${venueLine}\n\n` +
    `You'll get a final confirmation once payment is verified. Any questions, just reply on WhatsApp.\n\nSee you there!`
  const html =
    `<p>${hi}</p><p>Thanks for booking onto <strong>${input.campName}</strong>! We've received your payment details and the coach will confirm your place shortly.</p>` +
    `<ul>${input.children.map((c) => `<li>${c.childName}${c.age != null ? ` (age ${c.age})` : ''} — ${c.dayLabels.join(', ')} — £${c.total.toFixed(2)}</li>`).join('')}</ul>` +
    `<p><strong>Total: £${total.toFixed(2)}</strong>${venueLine ? `<br>Venue: ${input.venue!.trim()}` : ''}</p>` +
    `<p>You'll get a final confirmation once payment is verified. Any questions, just reply on WhatsApp.</p><p>See you there!</p>`
  return { subject, text, html }
}

// ─── PT booking flow (Paul's spec Flow 2 — Private Lesson Booking) ───

interface PtSlotLite {
  id: string
  slot_date: string
  start_time: string
  end_time: string
  duration_min: number
  price_gbp: string | null
}

function formatSlotLine(s: PtSlotLite, letter: string): string {
  const d = new Date(s.slot_date + 'T00:00:00')
  const datePart = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  // HH:MM:SS -> friendly 'h:mm am/pm'
  const [hStr, mStr] = s.start_time.split(':')
  let h = parseInt(hStr, 10)
  const m = mStr.padStart(2, '0')
  const ampm = h >= 12 ? 'pm' : 'am'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  const timePart = m === '00' ? `${h}${ampm}` : `${h}:${m}${ampm}`
  const price = s.price_gbp ? ` — £${Number(s.price_gbp).toFixed(2)}` : ''
  return `${letter}) ${datePart} ${timePart} — ${s.duration_min} min${price}`
}

// Outbound "here's what's available" message presenting up to 8 slots.
export function buildPtSlotOfferMessage(input: {
  memberFirstName: string
  coachName: string
  slots: PtSlotLite[]
}): string {
  const greeting = input.memberFirstName ? `Hi ${input.memberFirstName} — ` : ''
  const lettered = input.slots
    .map((s, i) => formatSlotLine(s, String.fromCharCode(97 + i)))
    .join('\n')
  return `${greeting}here's what's available with ${input.coachName} over the next two weeks:\n\n${lettered}\n\nReply with a letter to book (e.g. "a"). Slot is held for you for 15 minutes once you pick.`
}

// Parse a free-text reply ("a", "the first one", "tuesday at 7", "Monday morning")
// → slot index. Returns null on unparseable. Uses Claude in JSON-only mode.
export async function parsePtSlotSelection(
  reply: string,
  slots: PtSlotLite[]
): Promise<number | null> {
  const lettered = slots
    .map((s, i) => `  ${String.fromCharCode(97 + i)} (index ${i}) = ${formatSlotLine(s, '').replace(/^\)\s*/, '')}`)
    .join('\n')

  const systemPrompt = `You parse a client's WhatsApp reply choosing which PT session slot they want.

You will be given the list of offered slots with letter labels and 0-based indices, and the client's reply text.

Return ONLY a single JSON object on one line. Schema:
  {"index": 0}   — the 0-based index of the chosen slot
  {"index": null} — if the reply is unparseable or doesn't pick a slot

Interpretation rules:
- Letter references ("a", "b", "the b one") → matching index
- Day-of-week references ("Tuesday", "Mon") → match against the label
- Time references ("7am", "evening", "morning") → match plausibly against the start_time
- "First / second / third / next one" → ordinal index (0, 1, 2, ...)
- "Yes" / "ok" / "sure" without a specifier → null (not enough info)
- Multiple selections ("a and b") → return only the first match
- Never invent an index outside the provided range.`

  const userMsg = `Available slots:\n${lettered}\n\nClient's reply: "${reply}"\n\nReturn JSON now.`

  const raw = await callClaude(systemPrompt, [{ role: 'user', content: userMsg }], 80)
  const match = raw.match(/\{[^}]*"index"\s*:\s*(?:null|\d+)[^}]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0]) as { index: number | null }
    if (parsed.index === null) return null
    const n = Math.floor(parsed.index)
    if (!Number.isInteger(n) || n < 0 || n >= slots.length) return null
    return n
  } catch {
    return null
  }
}

// Plain template — payment instructions need to land verbatim.
export function buildPtBookingPaymentInstructions(input: {
  slot: PtSlotLite
  paymentLink: string | null
  holdMinutes: number
}): string {
  const d = new Date(input.slot.slot_date + 'T00:00:00')
  const datePart = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  const [hStr, mStr] = input.slot.start_time.split(':')
  let h = parseInt(hStr, 10)
  const m = mStr.padStart(2, '0')
  const ampm = h >= 12 ? 'pm' : 'am'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  const timePart = m === '00' ? `${h}${ampm}` : `${h}:${m}${ampm}`
  const price = input.slot.price_gbp ? `£${Number(input.slot.price_gbp).toFixed(2)}` : 'the session fee'
  const lines: string[] = []
  lines.push(`Booked in pending payment ✓`)
  lines.push('')
  lines.push(`${datePart} ${timePart} — ${input.slot.duration_min} min`)
  lines.push('')
  if (input.paymentLink) {
    lines.push(`Pay ${price} here: ${input.paymentLink}`)
  } else {
    lines.push(`Send ${price} to the studio's usual payment details.`)
  }
  lines.push('')
  lines.push(`Slot held for ${input.holdMinutes} minutes. Reply "PAID" once you've sent it and I'll lock it in.`)
  return lines.join('\n')
}

// Confirmed booking message — sent after successful "PAID" reply.
export function buildPtBookingConfirmed(input: {
  slot: PtSlotLite
  coachName: string
}): string {
  const d = new Date(input.slot.slot_date + 'T00:00:00')
  const datePart = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  const [hStr, mStr] = input.slot.start_time.split(':')
  let h = parseInt(hStr, 10)
  const m = mStr.padStart(2, '0')
  const ampm = h >= 12 ? 'pm' : 'am'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  const timePart = m === '00' ? `${h}${ampm}` : `${h}:${m}${ampm}`
  return `Booked! ✓\n\n${input.coachName} | ${datePart} ${timePart} | ${input.slot.duration_min} min\n\nSee you there 💪`
}

// Sent when we can't parse the slot selection reply.
export function buildPtUnparseableNudge(slots: PtSlotLite[]): string {
  const lettered = slots
    .map((s, i) => formatSlotLine(s, String.fromCharCode(97 + i)))
    .join('\n')
  return `Sorry — didn't catch which slot you'd like. Reply with a single letter (a, b, c…) from this list:\n\n${lettered}`
}
