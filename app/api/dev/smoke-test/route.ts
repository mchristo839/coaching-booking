// app/api/dev/smoke-test/route.ts
// Self-test endpoint — verifies conversation logging, bot reply dedup,
// and message dedup all work in production. Protected by HEALTH_CHECK_SECRET.

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { safeLogConversation, trackBotReply, isMessageProcessed } from '@/app/lib/db'

function isAuthorised(request: NextRequest): boolean {
  const secret = process.env.HEALTH_CHECK_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

interface TestResult {
  name: string
  pass: boolean
  detail: string
}

async function testConversationLogging(): Promise<TestResult> {
  const testId = `smoke-test-${Date.now()}`
  try {
    const result = await safeLogConversation({
      groupJid: testId,
      senderJid: 'smoke-test@s.whatsapp.net',
      senderName: 'Smoke Test',
      messageText: 'Smoke test message',
      botResponse: 'Smoke test response',
      category: 'smoke_test',
      escalated: false,
    })

    if (!result.success) {
      return { name: 'conversation_logging', pass: false, detail: `Insert failed: ${result.error}` }
    }

    // Verify it landed
    const { rows } = await sql`
      SELECT id, category FROM conversations
      WHERE group_jid = ${testId} LIMIT 1
    `

    // Cleanup
    await sql`DELETE FROM conversations WHERE group_jid = ${testId}`

    if (rows.length === 0) {
      return { name: 'conversation_logging', pass: false, detail: 'Insert succeeded but row not found on read-back' }
    }

    return { name: 'conversation_logging', pass: true, detail: `Inserted and read back conversation id=${rows[0].id}` }
  } catch (error) {
    // Cleanup on error
    await sql`DELETE FROM conversations WHERE group_jid = ${testId}`.catch(() => {})
    return { name: 'conversation_logging', pass: false, detail: String(error) }
  }
}

async function testBotReplyDedup(): Promise<TestResult> {
  const testGroup = `smoke-dedup-${Date.now()}@g.us`
  try {
    // First call should NOT be duplicate
    const first = await trackBotReply(testGroup, 'smoke_test', 'smoke-msg-1')
    if (first.isDuplicate) {
      return { name: 'bot_reply_dedup', pass: false, detail: 'First call was marked as duplicate' }
    }

    // Second call within 10s should BE duplicate
    const second = await trackBotReply(testGroup, 'smoke_test', 'smoke-msg-2')

    // Cleanup
    await sql`DELETE FROM bot_replies WHERE group_jid = ${testGroup}`

    if (!second.isDuplicate) {
      return { name: 'bot_reply_dedup', pass: false, detail: 'Second call was NOT marked as duplicate (expected duplicate)' }
    }

    return { name: 'bot_reply_dedup', pass: true, detail: 'First call allowed, second call correctly blocked as duplicate' }
  } catch (error) {
    await sql`DELETE FROM bot_replies WHERE group_jid = ${testGroup}`.catch(() => {})
    return { name: 'bot_reply_dedup', pass: false, detail: String(error) }
  }
}

async function testMessageDedup(): Promise<TestResult> {
  const testMsgId = `smoke-msg-${Date.now()}`
  try {
    // First call should return false (not processed)
    const first = await isMessageProcessed(testMsgId)
    if (first) {
      return { name: 'message_dedup', pass: false, detail: 'Fresh messageId was marked as already processed' }
    }

    // Second call should return true (already processed)
    const second = await isMessageProcessed(testMsgId)

    // Cleanup
    await sql`DELETE FROM processed_messages WHERE message_id = ${testMsgId}`

    if (!second) {
      return { name: 'message_dedup', pass: false, detail: 'Second call was NOT marked as processed (expected true)' }
    }

    return { name: 'message_dedup', pass: true, detail: 'First call returned false, second call correctly returned true' }
  } catch (error) {
    await sql`DELETE FROM processed_messages WHERE message_id = ${testMsgId}`.catch(() => {})
    return { name: 'message_dedup', pass: false, detail: String(error) }
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const results = await Promise.all([
    testConversationLogging(),
    testBotReplyDedup(),
    testMessageDedup(),
  ])

  const allPassed = results.every((r) => r.pass)

  return NextResponse.json({
    allPassed,
    results,
    timestamp: new Date().toISOString(),
  })
}
