// app/api/dev/whatsapp-status/route.ts
// One-shot diagnostic for "bot isn't responding" issues.
// Returns: Evolution webhook config for paul-bot + Evolution connection state
// + last 5 entries from the conversations table.
// Auth: any logged-in coach. Read-only.

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { getAuthFromRequest } from '@/app/lib/auth'

export const dynamic = 'force-dynamic'

const EVOLUTION_BASE_URL = (process.env.EVOLUTION_API_URL || 'http://161.97.176.176:8080').trim()
const EVOLUTION_API_KEY = (process.env.EVOLUTION_API_KEY || '').trim()
const EVOLUTION_INSTANCE = (process.env.EVOLUTION_INSTANCE || 'paul-bot').trim()

async function evolutionFetch(path: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(`${EVOLUTION_BASE_URL}${path}`, {
      headers: { apikey: EVOLUTION_API_KEY },
      signal: controller.signal,
    })
    clearTimeout(timeout)
    const text = await res.text()
    let body: unknown = text
    try { body = JSON.parse(text) } catch { /* keep as text */ }
    return { ok: res.ok, status: res.status, body }
  } catch (e) {
    return { ok: false, status: 0, body: { error: String(e) } }
  }
}

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Login required' }, { status: 401 })
  }

  const [webhookConfig, connectionState] = await Promise.all([
    evolutionFetch(`/webhook/find/${EVOLUTION_INSTANCE}`),
    evolutionFetch(`/instance/connectionState/${EVOLUTION_INSTANCE}`),
  ])

  let recentConversations: unknown = null
  let recentBotReplies: unknown = null
  try {
    const { rows } = await sql`
      SELECT id, created_at, group_jid, sender_name,
             LEFT(message_text, 80) as message_preview,
             CASE WHEN bot_response IS NULL THEN false ELSE true END as has_reply,
             LEFT(bot_response, 80) as reply_preview,
             category, escalated
      FROM conversations
      ORDER BY created_at DESC
      LIMIT 5
    `
    recentConversations = rows
  } catch (e) {
    recentConversations = { error: String(e) }
  }

  try {
    const { rows } = await sql`
      SELECT group_jid, reply_type, sent_at
      FROM bot_replies
      ORDER BY sent_at DESC
      LIMIT 5
    `
    recentBotReplies = rows
  } catch (e) {
    recentBotReplies = { error: String(e) }
  }

  const expectedWebhookUrl = 'https://coaching-booking-v3.vercel.app/api/webhooks/whatsapp'
  const configured = (webhookConfig.body as { url?: string; webhook?: { url?: string } } | null)
  const actualWebhookUrl = configured?.url || configured?.webhook?.url || null
  const webhookUrlMatches = actualWebhookUrl === expectedWebhookUrl

  return NextResponse.json({
    summary: {
      expectedWebhookUrl,
      actualWebhookUrl,
      webhookUrlMatches,
      evolutionReachable: webhookConfig.ok || connectionState.ok,
      paulBotState: (connectionState.body as { instance?: { state?: string }; state?: string } | null)?.instance?.state
        || (connectionState.body as { state?: string } | null)?.state
        || 'unknown',
    },
    webhookConfig,
    connectionState,
    recentConversations,
    recentBotReplies,
    env: {
      EVOLUTION_BASE_URL,
      EVOLUTION_INSTANCE,
      hasEvolutionApiKey: Boolean(EVOLUTION_API_KEY),
      hasBotJid: Boolean(process.env.BOT_JID),
      hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}
