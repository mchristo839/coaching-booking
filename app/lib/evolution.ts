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
