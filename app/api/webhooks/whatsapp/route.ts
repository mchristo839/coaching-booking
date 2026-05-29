import { NextRequest, NextResponse } from 'next/server'
import { findProgramByWhatsAppGroup, safeLogConversation, isMessageProcessed, trackBotReply, type Knowledgebase } from '@/app/lib/db'
import { sendWhatsAppMessage } from '@/app/lib/evolution'
import { getActivePollForGroup, recordPollResponse, getPollByWaMessageId, optOutMemberByJid } from '@/app/lib/control-centre-db'
import { tryHandleFeedbackReply } from '@/app/lib/feedback'
import { tryHandleCampBookingReply } from '@/app/lib/camp-booking'
import { tryHandlePtBookingReply } from '@/app/lib/calendar'
import { tryHandleCancellationReply } from '@/app/lib/cancellation'
import { tryHandleEnquiryMessage } from '@/app/lib/enquiry-chase'
import { tryHandleOnboardingReply } from '@/app/lib/onboarding'
import { resolveSender, classifyIntent, logInboxInteraction } from '@/app/lib/inbox-agent'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
const BOT_JID = process.env.BOT_JID || ''

/**
 * Detect if the bot was @mentioned in a WhatsApp group message.
 * WhatsApp uses LIDs (Linked Identities) in groups, so mentionedJid may contain
 * a LID like "165722051334265@lid" instead of the phone-based "447458164754@s.whatsapp.net".
 * Uses 3 detection strategies:
 *   1. Exact BOT_JID match in mentionedJid array
 *   2. Bot's phone number appears in message text as @phone
 *   3. Any mentionedJid number appears in message text as @number (LID-based)
 */
function isBotMentioned(messageText: string, mentionedJids: string[]): boolean {
  if (!BOT_JID) return false
  const botPhone = BOT_JID.split('@')[0]

  // Check 1: exact JID match
  if (mentionedJids.includes(BOT_JID)) return true

  // Check 2: bot phone number appears in message text
  if (botPhone && messageText.includes(`@${botPhone}`)) return true

  // Check 3: LID-based — any mentionedJid number appears in message text
  for (const jid of mentionedJids) {
    const jidNumber = jid.split('@')[0]
    if (jidNumber && messageText.includes(`@${jidNumber}`)) return true
  }

  return false
}

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

/** Simple category classification based on message content */
function classifyMessage(text: string): { category: string; escalated: boolean } {
  const lower = text.toLowerCase()

  // Escalation keywords
  const escalationPatterns = [
    /injur/i, /hurt/i, /accident/i, /emergency/i, /ambulance/i,
    /complain/i, /safeguard/i, /abuse/i, /bully/i, /inappropriat/i,
    /refund/i, /legal/i, /solicitor/i, /lawyer/i,
  ]

  for (const pattern of escalationPatterns) {
    if (pattern.test(lower)) {
      return { category: 'escalation', escalated: true }
    }
  }

  // Question detection
  if (lower.includes('?') || /^(when|where|what|how|can|do|is|are|will|does)\b/i.test(lower)) {
    return { category: 'question', escalated: false }
  }

  // Social / greeting
  if (/^(hi|hey|hello|thanks|thank you|cheers|good morning|good evening|👍|😊|🙏)/i.test(lower)) {
    return { category: 'social', escalated: false }
  }

  return { category: 'general', escalated: false }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const event = body.event
    const data = body.data

    // ─── Native WhatsApp poll vote handler ───
    // Native polls send pollUpdateMessage events (may arrive as messages.update
    // or messages.upsert with message.pollUpdateMessage). Evolution v2 also fires
    // its own "pollUpdate" event in some configurations. Handle all three.
    const pollUpdate =
      data?.message?.pollUpdateMessage ||
      data?.pollUpdateMessage ||
      (event === 'poll.update' ? data : null) ||
      (event === 'messages.update' && data?.update?.pollUpdates ? data.update.pollUpdates[0] : null)

    if (pollUpdate) {
      try {
        // The id of the original poll (our stored wa_message_id)
        const pollWaId: string =
          pollUpdate?.pollCreationMessageKey?.id ||
          pollUpdate?.pollCreationMessage?.key?.id ||
          data?.pollCreationMessageKey?.id ||
          ''

        // The voter's JID and name
        const voterJid: string =
          data?.key?.participant ||
          data?.key?.remoteJid ||
          pollUpdate?.pollUpdater ||
          ''
        const voterName: string = data?.pushName || 'there'

        // The selected options — Evolution may send this as decrypted strings
        // or as SHA256 hashes. We try decrypted first, fall back to nothing.
        const selectedOptions: string[] =
          pollUpdate?.vote?.selectedOptions ||
          pollUpdate?.selectedOptions ||
          pollUpdate?.selected ||
          []

        if (pollWaId && selectedOptions.length > 0) {
          const pollRow = await getPollByWaMessageId(pollWaId)
          if (pollRow && pollRow.status === 'active') {
            const allOptions: string[] = Array.isArray(pollRow.options)
              ? pollRow.options
              : JSON.parse(pollRow.options || '[]')

            // Match selected values against known options (case-insensitive).
            // If they come as hashes we can't match here — fallback is nothing.
            for (const sel of selectedOptions) {
              const selStr = String(sel)
              const matched = allOptions.find(
                (o: string) => o.toLowerCase() === selStr.toLowerCase()
              )
              if (matched) {
                await recordPollResponse(
                  pollRow.poll_id,
                  pollRow.programme_id,
                  voterJid,
                  voterName,
                  matched
                )
              }
            }
            console.log(`[POLL-VOTE] ${voterName} -> ${selectedOptions.join(', ')}`)
          }
        } else {
          console.log('[POLL-VOTE] Could not parse pollUpdate payload:', JSON.stringify(pollUpdate).slice(0, 500))
        }
      } catch (e) {
        console.error('[POLL-VOTE] error parsing pollUpdate:', e)
      }
      return NextResponse.json({ ok: true })
    }

    // Only handle incoming text messages
    if (event !== 'messages.upsert') {
      return NextResponse.json({ ok: true })
    }

    // Ignore messages sent by the bot itself
    if (data?.key?.fromMe) {
      return NextResponse.json({ ok: true })
    }

    const remoteJid: string = data?.key?.remoteJid || ''
    const isGroup = remoteJid.endsWith('@g.us')
    const messageId: string = data?.key?.id || ''

    // ─── 1:1 reply branches (holiday camp + fitness feedback) ───
    // Both branches are self-gating: they only fire when the sender has an
    // open booking/feedback row. For everyone else they return false in
    // microseconds and the existing group-only logic below runs untouched.
    // Each branch has its own try/catch so a failure here can never break
    // Paul's group bot.
    if (!isGroup && remoteJid) {
      const inboundText: string =
        data?.message?.conversation ||
        data?.message?.extendedTextMessage?.text ||
        ''

      if (inboundText.trim()) {
        // Dedup check first — same processed_messages table as the group
        // path, so a duplicate Evolution webhook can't double-process.
        if (messageId) {
          const alreadyProcessed = await isMessageProcessed(messageId)
          if (alreadyProcessed) return NextResponse.json({ ok: true })
        }

        // ─── Marketing opt-out (STOP) — highest priority, runs before any flow ───
        // PECR requires an easy opt-out honoured on every promotional message.
        // A bare STOP/UNSUBSCRIBE in a 1:1 sets members.marketing_opt_out so we
        // never DM them a promo again. Wrapped so a failure can't break the bot.
        const optOutWord = inboundText.trim().toLowerCase().replace(/[.!]+$/, '')
        if (['stop', 'unsubscribe', 'stop all', 'opt out', 'optout'].includes(optOutWord)) {
          try {
            const n = await optOutMemberByJid(remoteJid)
            if (n > 0) {
              await sendWhatsAppMessage(
                remoteJid,
                "You're unsubscribed — we won't send you any more promotional messages. You can still message here anytime if you need something."
              )
            }
          } catch (e) {
            console.error('[OPT-OUT BRANCH] error:', e)
          }
          return NextResponse.json({ ok: true })
        }

        // ─── Inbox Agent — identity + intent classification (observability) ───
        // Runs in parallel with routing so a slow LLM classify never blocks
        // the bot's reply path. We capture the promise + log when it resolves
        // (after the branch runs, so we can record action_taken too).
        const inboxStart = Date.now()
        const senderPromise = resolveSender(remoteJid).catch(() => null)

        let consumedBy: string | null = null

        // Branch order matters when a member is mid-flow on multiple things:
        //   0. Onboarding (highest priority — once intake starts, all replies
        //      belong to it until completed/abandoned)
        //   1. Camp booking (active financial transaction)
        //   2. PT booking (also financial; can start a new flow from intent keywords)
        //   3. Feedback (passive follow-up; lowest priority)
        // Each branch is self-gating (returns false fast when no open state) and
        // wrapped in its own try/catch so a failure can't take Paul's group bot down.

        try {
          if (await tryHandleOnboardingReply(remoteJid, inboundText)) {
            consumedBy = 'onboarding'
          }
        } catch (e) {
          console.error('[ONBOARDING BRANCH] error, falling through:', e)
        }

        if (!consumedBy) {
          try {
            if (await tryHandleCampBookingReply(remoteJid, inboundText)) {
              consumedBy = 'camp_booking'
            }
          } catch (e) {
            console.error('[CAMP BRANCH] error, falling through:', e)
          }
        }

        if (!consumedBy) {
          try {
            if (await tryHandlePtBookingReply(remoteJid, inboundText)) {
              consumedBy = 'pt_booking'
            }
          } catch (e) {
            console.error('[PT-BOOKING BRANCH] error, falling through:', e)
          }
        }

        if (!consumedBy) {
          try {
            if (await tryHandleCancellationReply(remoteJid, inboundText)) {
              consumedBy = 'cancellation'
            }
          } catch (e) {
            console.error('[CANCELLATION BRANCH] error, falling through:', e)
          }
        }

        if (!consumedBy) {
          try {
            if (await tryHandleFeedbackReply(remoteJid, inboundText)) {
              consumedBy = 'feedback'
            }
          } catch (e) {
            console.error('[FEEDBACK BRANCH] error, falling through:', e)
          }
        }

        // Last 1:1 branch: unknown senders start the new-enquiry chase
        // ladder (Flow 4). Known members + coaches return false from
        // tryHandleEnquiryMessage so the standard fallback below still runs.
        if (!consumedBy) {
          try {
            if (await tryHandleEnquiryMessage(remoteJid, inboundText)) {
              consumedBy = 'enquiry_chase'
            }
          } catch (e) {
            console.error('[ENQUIRY BRANCH] error, falling through:', e)
          }
        }

        // Inbox Agent log — runs after routing so we capture action_taken.
        // Classification + log are non-blocking; we don't await before
        // returning the webhook response.
        ;(async () => {
          try {
            const sender = (await senderPromise) || {
              type: 'unknown' as const,
              jid: remoteJid,
              record_id: null,
              display_name: null,
              coach_id: null,
              programme_id: null,
            }
            const classification = await classifyIntent(inboundText, sender)
            await logInboxInteraction({
              sender,
              messageText: inboundText,
              isGroup: false,
              groupJid: null,
              classification,
              actionTaken: consumedBy ? `routed_to_${consumedBy}` : 'no_handler',
              resolvedBy: consumedBy ? 'bot' : 'unresolved',
              escalated: classification.sentiment === 'negative',
              responseTimeMs: Date.now() - inboxStart,
              messageId: messageId || null,
            })
          } catch (e) {
            console.error('[INBOX log] error:', e)
          }
        })()

        if (consumedBy) return NextResponse.json({ ok: true })
      }
      // Either no in-flight 1:1 conversation, no text, or handler errored.
      // Match pre-existing behaviour: silently drop non-group messages.
      return NextResponse.json({ ok: true })
    }

    // Group-only from here. Use groupJid (the remote JID, which is the
    // group's JID for @g.us messages).
    const groupJid = remoteJid
    if (!isGroup) {
      // Defensive: should be unreachable because the 1:1 branch above
      // already returned for non-group messages.
      return NextResponse.json({ ok: true })
    }

    // Message dedup: Evolution API can fire the same webhook twice
    if (messageId) {
      const alreadyProcessed = await isMessageProcessed(messageId)
      if (alreadyProcessed) {
        console.log(`[SKIP-DUPLICATE] Message ${messageId} already processed`)
        return NextResponse.json({ ok: true })
      }
    }

    // Extract message text
    const messageText: string =
      data?.message?.conversation ||
      data?.message?.extendedTextMessage?.text ||
      ''

    if (!messageText.trim()) {
      return NextResponse.json({ ok: true })
    }

    const senderJid: string = data?.key?.participant || data?.key?.remoteJid || ''
    const senderName: string = data?.pushName || 'there'

    console.log(`[LOG] Incoming message from ${senderName} in ${groupJid}: ${messageText.slice(0, 100)}`)

    // Classify the message
    const { category, escalated } = classifyMessage(messageText)

    // Look up which program this group belongs to
    const program = await findProgramByWhatsAppGroup(groupJid)

    if (!program) {
      // Group not linked to any program
      console.log(`[LOG] Unlinked group: ${groupJid}`)
      const reply = `👋 Hi! I'm your CoachBook bot. To activate me for this group, go to your Programmes dashboard and paste in this group ID:\n\n*${groupJid}*`

      const { isDuplicate: dupUnlinked } = await trackBotReply(groupJid, 'unlinked', messageId)
      if (dupUnlinked) return NextResponse.json({ ok: true })

      await sendWhatsAppMessage(groupJid, reply)

      await safeLogConversation({
        groupJid,
        senderJid,
        senderName,
        messageText,
        botResponse: reply,
        category: 'unlinked',
        escalated: false,
      })

      return NextResponse.json({ ok: true })
    }

    if (!program.knowledgebase) {
      // Program linked but knowledgebase not filled in yet
      console.log(`[LOG] Programme ${program.id} has no knowledgebase`)
      const reply = `👋 I'm connected to this group but my knowledgebase isn't set up yet. ${program.coach_name}, please go to your Programmes dashboard and fill in the programme details to activate me.`

      const { isDuplicate: dupNoKb } = await trackBotReply(groupJid, 'no_knowledgebase', messageId)
      if (dupNoKb) return NextResponse.json({ ok: true })

      await sendWhatsAppMessage(groupJid, reply)

      await safeLogConversation({
        programmeId: program.id,
        groupJid,
        senderJid,
        senderName,
        messageText,
        botResponse: reply,
        category: 'no_knowledgebase',
        escalated: false,
      })

      return NextResponse.json({ ok: true })
    }

    // ─── Poll response parsing ───
    // If there's an active poll for this group and the message matches a letter (a/b/c)
    // or an option string, record the vote and return without replying.
    const activePoll = await getActivePollForGroup(groupJid)
    if (activePoll) {
      const pollOptions: string[] = Array.isArray(activePoll.options)
        ? activePoll.options
        : JSON.parse(activePoll.options || '[]')
      const trimmed = messageText.trim()
      const lowered = trimmed.toLowerCase()

      let chosen: string | null = null

      // Letter match: "a", "A", "a)", "a." etc.
      const letterMatch = lowered.match(/^([a-z])[\).\s]?$/)
      if (letterMatch) {
        const idx = letterMatch[1].charCodeAt(0) - 97
        if (idx >= 0 && idx < pollOptions.length) {
          chosen = pollOptions[idx]
        }
      }

      // Exact option text match (case insensitive)
      if (!chosen) {
        const exact = pollOptions.find((opt: string) => opt.toLowerCase() === lowered)
        if (exact) chosen = exact
      }

      if (chosen) {
        console.log(`[LOG] Poll vote from ${senderName}: ${chosen}`)
        const result = await recordPollResponse(
          activePoll.id,
          activePoll.programme_id,
          senderJid,
          senderName,
          chosen
        )

        // 1:1 follow-up based on outcome
        let followUp: string | null = null
        if (result.status === 'confirmed') {
          if (result.payment_link) {
            followUp = `✅ You're in for "${result.poll_question}". To lock your spot please pay here: ${result.payment_link}`
          } else {
            followUp = `✅ You're in for "${result.poll_question}". See you there!`
          }
        } else if (result.status === 'waitlisted') {
          followUp = `📋 "${result.poll_question}" is full — I've added you to the waitlist. I'll message you the moment a spot opens up.`
        } else if (result.status === 'closed') {
          followUp = `Sorry — "${result.poll_question}" is now closed. I'll let you know when the next one's up.`
        }

        if (followUp) {
          // Fire-and-forget 1:1 DM so we don't block the webhook response
          ;(async () => {
            try {
              await sendWhatsAppMessage(senderJid, followUp!)
            } catch (e) {
              console.error('[poll follow-up] send failed:', e)
            }
          })()
        }

        await safeLogConversation({
          programmeId: program.id,
          groupJid,
          senderJid,
          senderName,
          messageText,
          botResponse: followUp,
          category: `poll_vote_${result.status}`,
          escalated: false,
        })
        return NextResponse.json({ ok: true })
      }
    }

    // ─── @mention check (currently disabled) ───
    // Bot replies to all group messages, per CLAUDE.md ("no @mention filtering yet").
    // The previous mention-only logic silently dropped messages because:
    //   1. BOT_JID was set to the phone-based JID (447458164754@s.whatsapp.net) but
    //      WhatsApp groups address the bot via its LID (e.g. 165722051334265@lid),
    //      so isBotMentioned returned false for valid mentions.
    //   2. If BOT_JID was unset, isBotMentioned returned false for everything.
    // Re-enable once BOT_JID can resolve both JID + LID identities (or we read the
    // bot's identity from Evolution at startup).
    void isBotMentioned // kept for future re-enable; silences unused-var lint
    void BOT_JID

    // Strip @number tags from message text before sending to Claude
    const cleanedText = messageText.replace(/@\d+/g, '').trim()
    const messageWithContext = `${senderName} asks: ${cleanedText}`

    const systemPrompt = buildSystemPrompt({
      program_name: program.program_name,
      coach_name: program.coach_name,
      knowledgebase: program.knowledgebase as Knowledgebase,
    })

    const reply = await askClaude(systemPrompt, messageWithContext)

    const { isDuplicate } = await trackBotReply(groupJid, category, messageId)
    if (isDuplicate) return NextResponse.json({ ok: true })

    await sendWhatsAppMessage(groupJid, reply)

    console.log(`[LOG] Bot replied in ${groupJid}, category: ${category}, escalated: ${escalated}`)

    await safeLogConversation({
      programmeId: program.id,
      groupJid,
      senderJid,
      senderName,
      messageText,
      botResponse: reply,
      category,
      escalated,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[LOG-ERROR] WhatsApp webhook error:', error)
    // Always return 200 to Evolution API so it doesn't retry endlessly
    return NextResponse.json({ ok: true })
  }
}
