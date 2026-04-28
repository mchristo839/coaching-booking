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
