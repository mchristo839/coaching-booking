import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { findProgramByWhatsAppGroup, getProgrammeAvailability, safeLogConversation, isMessageProcessed, trackBotReply, type Knowledgebase } from '@/app/lib/db'
import { sendWhatsAppMessage } from '@/app/lib/evolution'
import {
  classifyBotIntent,
  planBotResponse,
  phraseAnswer,
  buildHandoffMessage,
  buildMissingDataMessage,
} from '@/app/lib/bot-intent'
import { notifyCoachHandoff } from '@/app/lib/notify'
import { getActivePollForGroup, recordPollResponse, getPollByWaMessageId, optOutMemberByJid } from '@/app/lib/control-centre-db'
import { tryHandleFeedbackReply } from '@/app/lib/feedback'
import { tryHandleCampBookingReply, startCampBookingFromPoll, tryHandleCoachCampConfirm, getActiveCampForProgramme, answerGroupCampQuestion } from '@/app/lib/camp-booking'
import { matchActiveFaq } from '@/app/lib/faq-learning'
import { tryHandlePtBookingReply } from '@/app/lib/calendar'
import { tryHandleCancellationReply } from '@/app/lib/cancellation'
import { tryHandleEnquiryMessage } from '@/app/lib/enquiry-chase'
import { tryHandleOnboardingReply } from '@/app/lib/onboarding'
import { resolveSender, classifyIntent, logInboxInteraction } from '@/app/lib/inbox-agent'

const BOT_JID = process.env.BOT_JID || ''

// Resolve a single selected-option value from a native WhatsApp poll vote
// back to the original option text.
//
// Once Evolution/Baileys decrypts a poll vote, each selected option arrives as
// the SHA-256 hash of the option's text (that's how WhatsApp poll votes work),
// NOT the plaintext — though some Evolution configs do send plaintext. The
// value may also arrive as raw bytes (Uint8Array / number[] / {data:[…]}) or as
// a hex/base64 string. We normalise the incoming value into candidate forms and
// match it against each known option's plaintext and SHA-256 (hex + base64).
// Returns the matched option, or null when nothing matches.
function resolvePollOption(allOptions: string[], selected: unknown): string | null {
  const candidates = new Set<string>()
  const push = (s: string | undefined | null) => {
    if (s) {
      candidates.add(s)
      candidates.add(s.toLowerCase())
    }
  }

  if (typeof selected === 'string') {
    push(selected)
  } else if (selected && typeof selected === 'object') {
    const obj = selected as Record<string, unknown>
    const bytes: number[] | null = Array.isArray(selected)
      ? (selected as number[])
      : ArrayBuffer.isView(selected as ArrayBufferView)
        ? Array.from(selected as unknown as Uint8Array)
        : Array.isArray(obj.data)
          ? (obj.data as number[])
          : null
    if (bytes) {
      const buf = Buffer.from(bytes)
      push(buf.toString('hex'))
      push(buf.toString('base64'))
    } else {
      // Some payloads wrap the value, e.g. { name } / { optionName } / { value }.
      push((obj.name ?? obj.optionName ?? obj.value) as string | undefined)
    }
  }

  if (candidates.size === 0) return null

  for (const opt of allOptions) {
    if (candidates.has(opt) || candidates.has(opt.toLowerCase())) return opt
    const digest = createHash('sha256').update(opt, 'utf8').digest()
    if (candidates.has(digest.toString('hex')) || candidates.has(digest.toString('base64'))) {
      return opt
    }
  }
  return null
}

// Build the 1:1 follow-up DM for a recorded poll vote. Shared by BOTH the
// native-poll (pollUpdate) and text-vote paths so the two can never diverge:
// a "yes" that fits capacity gets the booking/payment link, a full poll
// waitlists, a closed poll says so. Returns null when no DM is warranted.
function pollFollowUpMessage(result: {
  status: 'confirmed' | 'waitlisted' | 'noted' | 'closed'
  payment_link: string | null
  poll_question: string
}): string | null {
  if (result.status === 'confirmed') {
    return result.payment_link
      ? `✅ You're in for "${result.poll_question}". To lock your spot please pay here: ${result.payment_link}`
      : `✅ You're in for "${result.poll_question}". See you there!`
  }
  if (result.status === 'waitlisted') {
    return `📋 "${result.poll_question}" is full — I've added you to the waitlist. I'll message you the moment a spot opens up.`
  }
  if (result.status === 'closed') {
    return `Sorry — "${result.poll_question}" is now closed. I'll let you know when the next one's up.`
  }
  return null
}

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
        const selectedOptions: unknown[] =
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

            // Resolve each selected value back to its option text. Handles
            // plaintext AND the SHA-256 hashes WhatsApp actually sends.
            let voteResult: Awaited<ReturnType<typeof recordPollResponse>> | null = null
            let matchedAny = false
            for (const sel of selectedOptions) {
              const matched = resolvePollOption(allOptions, sel)
              if (matched) {
                matchedAny = true
                const r = await recordPollResponse(
                  pollRow.poll_id,
                  pollRow.programme_id,
                  voterJid,
                  voterName,
                  matched
                )
                // Prefer the "yes" outcome when a vote selects multiple options.
                if (!voteResult || r.was_yes) voteResult = r
              }
            }
            if (matchedAny) {
              console.log(`[POLL-VOTE] ${voterName} -> ${voteResult?.was_yes ? `${voteResult.status} (YES)` : 'recorded'}`)
            } else {
              // Couldn't resolve any option — log the raw shape so we can see
              // exactly what Evolution is sending and extend resolvePollOption.
              console.warn('[POLL-VOTE] unmatched vote payload:', JSON.stringify(selectedOptions).slice(0, 500))
            }

            // If this poll is linked to a holiday camp, a YES starts the 1:1
            // camp booking conversation instead of the generic follow-up.
            let campStarted = false
            if (voteResult?.was_yes && pollRow.promotion_id && voterJid) {
              try {
                campStarted = await startCampBookingFromPoll(pollRow.promotion_id, voterJid, voterName, pollRow.programme_id)
              } catch (e) {
                console.error('[POLL-VOTE] camp trigger failed:', e)
              }
            }

            // Otherwise send the same 1:1 follow-up the text-vote path sends, so
            // a parent who taps "yes" on a NATIVE WhatsApp poll also gets their
            // booking link / waitlist / closed message.
            const nativeFollowUp = campStarted ? null : voteResult ? pollFollowUpMessage(voteResult) : null
            if (nativeFollowUp && voterJid) {
              try {
                await sendWhatsAppMessage(voterJid, nativeFollowUp)
              } catch (e) {
                console.error('[POLL-VOTE] follow-up send failed:', e)
              }
            }
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
        // Button/list taps carry no conversation text — capture the reply so a
        // pure tap (e.g. a coach confirming payment) is still processed.
        data?.message?.buttonsResponseMessage?.selectedDisplayText ||
        data?.message?.buttonsResponseMessage?.selectedButtonId ||
        data?.message?.templateButtonReplyMessage?.selectedDisplayText ||
        data?.message?.templateButtonReplyMessage?.selectedId ||
        data?.message?.listResponseMessage?.title ||
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

        // ─── Coach payment confirmation (highest priority) ───
        // A coach replying YES/NO (button or text) to a payment-confirm request
        // confirms/rejects the pending camp booking. Self-gating: only fires for
        // a coach with a pending confirmation and a clear yes/no.
        try {
          if (await tryHandleCoachCampConfirm(remoteJid, inboundText)) {
            consumedBy = 'coach_camp_confirm'
          }
        } catch (e) {
          console.error('[COACH CONFIRM BRANCH] error, falling through:', e)
        }

        // Branch order matters when a member is mid-flow on multiple things:
        //   0. Onboarding (highest priority — once intake starts, all replies
        //      belong to it until completed/abandoned)
        //   1. Camp booking (active financial transaction)
        //   2. PT booking (also financial; can start a new flow from intent keywords)
        //   3. Feedback (passive follow-up; lowest priority)
        // Each branch is self-gating (returns false fast when no open state) and
        // wrapped in its own try/catch so a failure can't take Paul's group bot down.

        if (!consumedBy) {
          try {
            if (await tryHandleOnboardingReply(remoteJid, inboundText)) {
              consumedBy = 'onboarding'
            }
          } catch (e) {
            console.error('[ONBOARDING BRANCH] error, falling through:', e)
          }
        }

        if (!consumedBy) {
          try {
            if (await tryHandleCampBookingReply(remoteJid, inboundText, data?.pushName)) {
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
    // We still run the keyword classifier purely to set the `escalated` flag on
    // the conversation log (injury / complaint / safeguarding). The closed-intent
    // gate below decides what the bot actually says.
    const { escalated } = classifyMessage(messageText)

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

        // If this poll is linked to a holiday camp, a YES starts the 1:1 camp
        // booking conversation instead of the generic follow-up.
        let campStarted = false
        if (result.was_yes && activePoll.promotion_id) {
          try {
            campStarted = await startCampBookingFromPoll(activePoll.promotion_id, senderJid, senderName, activePoll.programme_id)
          } catch (e) {
            console.error('[poll camp-trigger] failed:', e)
          }
        }

        // Otherwise the standard 1:1 follow-up (shared with the native-poll path)
        const followUp = campStarted ? null : pollFollowUpMessage(result)

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

    // Strip @number mention tags before classifying.
    const cleanedText = messageText.replace(/@\d+/g, '').trim()
    const kb = program.knowledgebase as Knowledgebase
    const coachName = (program.coach_name as string) || ''

    // Is there a live bookable camp for this group? (Used only to ANSWER camp
    // questions — the bot never pitches a booking link in the group; booking is
    // started by the poll vote.)
    const activeCamp = await getActiveCampForProgramme(program.id)

    // ─── Closed-intent gate ───
    // Recognise the intent widely, then answer ONLY from this programme's data
    // for the allowed intents. Everything else — and any in-scope question whose
    // backing data is missing — routes to the coach rather than being answered
    // or guessed.
    const { intent } = await classifyBotIntent(cleanedText)

    // Social chatter (greeting / thanks / emoji): stay quiet rather than reply to
    // every message in the group. Log it and move on.
    if (intent === 'social') {
      await safeLogConversation({
        programmeId: program.id,
        groupJid,
        senderJid,
        senderName,
        messageText,
        botResponse: null,
        category: 'social',
        escalated,
      })
      return NextResponse.json({ ok: true })
    }

    // Camp-structure questions ("which days / can I pick days / do I have to book
    // the whole week / what dates / how much per day") — answer from the camp's
    // OWN data (the programme knowledgebase doesn't carry these). No pitching,
    // just a straight answer. Gated to actual QUESTIONS (so a statement that
    // merely mentions "days" gets no reply), and only when the camp facts can
    // genuinely answer — otherwise it falls through to the normal gate.
    const looksLikeQuestion =
      /\?/.test(cleanedText) ||
      /^(do|does|did|can|could|is|are|am|was|were|will|would|should|how|what|whats|which|when|where|why|who|have|has|any|anyone|need)\b/i.test(cleanedText.trim())
    if (
      activeCamp && looksLikeQuestion &&
      /\b(days?|dates?|full week|whole week|which day|select|choose|how many|individual|per day|each day)\b/i.test(cleanedText)
    ) {
      const campAns = await answerGroupCampQuestion(activeCamp.id, cleanedText, program.program_name)
      if (campAns) {
        const { isDuplicate: dupCampQ } = await trackBotReply(groupJid, 'answer_camp', messageId)
        if (dupCampQ) return NextResponse.json({ ok: true })
        await sendWhatsAppMessage(groupJid, campAns)
        await safeLogConversation({ programmeId: program.id, groupJid, senderJid, senderName, messageText, botResponse: campAns, category: 'answer_camp', escalated })
        return NextResponse.json({ ok: true })
      }
    }

    const availability =
      intent === 'capacity_booking' ? await getProgrammeAvailability(program) : null
    const plan = planBotResponse(intent, kb, availability)

    // Social is already handled and returned above; this guard narrows the type.
    if (plan.action === 'social') {
      return NextResponse.json({ ok: true })
    }

    let reply: string
    let logCategory: string

    // When the structured gate can't answer, see if a COACH-APPROVED FAQ does.
    // FAQs are this programme's own approved Q&A (kb.customFaqs) — never shared.
    const faqMatch =
      plan.action !== 'answer' && Array.isArray(kb.customFaqs) && kb.customFaqs.length > 0
        ? await matchActiveFaq(cleanedText, kb.customFaqs)
        : null

    if (plan.action === 'answer') {
      reply = await phraseAnswer(cleanedText, plan.facts, program.program_name, { allowVenueGeo: plan.intent === 'location' })
      logCategory = `answer_${plan.intent}`
    } else if (faqMatch) {
      // Answer from the coach's approved FAQ (phrased scoped to ONLY that answer).
      reply = await phraseAnswer(cleanedText, `Coach's approved answer: ${faqMatch.a}`, program.program_name)
      logCategory = 'answer_faq'
    } else if (plan.reason === 'missing_data') {
      // In-scope question we don't have data for → genuine routing to the coach.
      reply = buildMissingDataMessage(coachName)
      logCategory = 'handoff_missing_data'
      try {
        await notifyCoachHandoff({ programmeId: program.id, parentName: senderName, question: cleanedText, reason: 'missing_data' })
      } catch (e) { console.error('[HANDOFF notify] error:', e) }
    } else {
      // Out-of-scope. Only route genuine QUESTIONS/REQUESTS (or anything the
      // keyword classifier flagged — injury/complaint/safeguarding). Plain group
      // chatter and statements get NO reply — the bot must not answer everything.
      const t = cleanedText.trim()
      const looksActionable =
        escalated ||
        /\?/.test(t) ||
        /^(can|could|do|does|did|is|are|am|was|were|what|whats|when|where|why|how|who|which|will|would|should|any|anyone|has|have|had|may|please|need|want|book|booking|join|pay|sign|tell|let|looking|after)\b/i.test(t)
      if (!looksActionable) {
        await safeLogConversation({
          programmeId: program.id, groupJid, senderJid, senderName, messageText,
          botResponse: null, category: 'ignored_out_of_scope', escalated,
        })
        return NextResponse.json({ ok: true })
      }
      reply = buildHandoffMessage(coachName)
      logCategory = 'handoff_out_of_scope'
      try {
        await notifyCoachHandoff({ programmeId: program.id, parentName: senderName, question: cleanedText, reason: 'out_of_scope' })
      } catch (e) { console.error('[HANDOFF notify] error:', e) }
    }

    const { isDuplicate } = await trackBotReply(groupJid, logCategory, messageId)
    if (isDuplicate) return NextResponse.json({ ok: true })

    await sendWhatsAppMessage(groupJid, reply)

    console.log(`[LOG] Bot replied in ${groupJid}, intent: ${intent}, action: ${plan.action}, escalated: ${escalated}`)

    await safeLogConversation({
      programmeId: program.id,
      groupJid,
      senderJid,
      senderName,
      messageText,
      botResponse: reply,
      category: logCategory,
      escalated,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[LOG-ERROR] WhatsApp webhook error:', error)
    // Always return 200 to Evolution API so it doesn't retry endlessly
    return NextResponse.json({ ok: true })
  }
}
