// Evolution API client — sends WhatsApp messages via the shared paul-bot instance
// SERVER-SIDE ONLY: Never import this in client components.

const EVOLUTION_BASE_URL = process.env.EVOLUTION_API_URL || 'http://35.239.224.242:8080'
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || ''
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'paul-bot'

export async function sendWhatsAppMessage(groupJid: string, text: string): Promise<void> {
  const url = `${EVOLUTION_BASE_URL}/message/sendText/${EVOLUTION_INSTANCE}`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: EVOLUTION_API_KEY,
    },
    body: JSON.stringify({
      number: groupJid,
      text,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Evolution API error ${res.status}: ${body}`)
  }
}

/**
 * Send a native WhatsApp poll to a group.
 * Returns the WhatsApp message_id (key.id) which we persist so we can
 * match incoming pollUpdateMessage webhook events back to the right poll.
 */
export async function sendWhatsAppPoll(
  groupJid: string,
  question: string,
  options: string[],
  selectableCount: number = 1
): Promise<{ messageId: string | null }> {
  const url = `${EVOLUTION_BASE_URL}/message/sendPoll/${EVOLUTION_INSTANCE}`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: EVOLUTION_API_KEY,
    },
    body: JSON.stringify({
      number: groupJid,
      name: question,
      selectableCount,
      values: options,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Evolution API sendPoll error ${res.status}: ${body}`)
  }

  const data = await res.json()
  return { messageId: data?.key?.id ?? null }
}
