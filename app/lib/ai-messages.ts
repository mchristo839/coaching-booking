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
  const res = await fetch('https://api.anthropic.com/v1/messages', {
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
  })

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

export type NudgeStep = 'pre_session' | 'session_day' | 'post_session' | 'lapsed_check'

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
    post_session: 'Hope they enjoyed their first session. Invite them to come back next time or ask for feedback.',
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
