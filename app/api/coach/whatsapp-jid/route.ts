import { NextRequest, NextResponse } from 'next/server'
import { updateCoachWhatsAppJid } from '@/app/lib/db'
import { getCoachIdFromRequest } from '@/app/lib/auth'

export async function PATCH(request: NextRequest) {
  try {
    const coachId = await getCoachIdFromRequest(request)
    if (!coachId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { phoneNumber } = await request.json()

    if (!phoneNumber) {
      return NextResponse.json({ error: 'phoneNumber is required' }, { status: 400 })
    }

    // Normalize to JID format: strip +, spaces, dashes, then append @s.whatsapp.net
    const digits = phoneNumber.replace(/[\s+\-()]/g, '')
    const jid = digits.includes('@') ? digits : `${digits}@s.whatsapp.net`

    await updateCoachWhatsAppJid(coachId, jid)

    return NextResponse.json({ success: true, whatsappJid: jid })
  } catch (error) {
    console.error('Update WhatsApp JID error:', error)
    return NextResponse.json({ error: 'Failed to update WhatsApp number' }, { status: 500 })
  }
}
