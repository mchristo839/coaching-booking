// app/lib/email.ts
// Thin wrapper around Resend. SERVER-SIDE ONLY.
//
// Env needed:
//   RESEND_API_KEY        — from resend.com → API keys
//   RESEND_FROM_ADDRESS   — e.g. "MyCoachingAssistant <hello@mycoachingassistant.com>"
//                           Domain must be verified in Resend first.
//
// All send calls degrade gracefully when RESEND_API_KEY is missing: they
// log a warning and return ok=false. Nothing in the app should throw on
// an email failure — receipts and .ics invites are nice-to-haves, not
// load-bearing.

import { Resend } from 'resend'

const FROM = process.env.RESEND_FROM_ADDRESS || 'MyCoachingAssistant <onboarding@resend.dev>'
const apiKey = process.env.RESEND_API_KEY || ''

let client: Resend | null = null
function getClient(): Resend | null {
  if (!apiKey) return null
  if (!client) client = new Resend(apiKey)
  return client
}

export interface EmailAttachment {
  filename: string
  content: string  // base64 or raw text; Resend accepts either
  content_type?: string
}

export interface SendEmailInput {
  to: string | string[]
  subject: string
  text?: string
  html?: string
  attachments?: EmailAttachment[]
  replyTo?: string
}

export interface SendEmailResult {
  ok: boolean
  id?: string
  error?: string
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const c = getClient()
  if (!c) {
    console.warn('[email] RESEND_API_KEY not set — skipping send to', input.to)
    return { ok: false, error: 'resend_not_configured' }
  }
  if (!input.text && !input.html) {
    return { ok: false, error: 'no_body' }
  }
  try {
    // Resend's SDK has strict typing requiring exactly one of text/html/react/template.
    // We always pass at least one (text fallback); use a loose payload to keep TS happy.
    const payload: Record<string, unknown> = {
      from: FROM,
      to: input.to,
      subject: input.subject,
    }
    if (input.html) payload.html = input.html
    if (input.text) payload.text = input.text
    if (input.replyTo) payload.replyTo = input.replyTo
    if (input.attachments) {
      payload.attachments = input.attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.content_type,
      }))
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await c.emails.send(payload as any)
    if (error) {
      return { ok: false, error: error.message || String(error) }
    }
    return { ok: true, id: data?.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
