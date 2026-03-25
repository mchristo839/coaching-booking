// app/api/programs/link-whatsapp/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { linkWhatsAppGroup } from '@/app/lib/db'

export async function POST(request: NextRequest) {
  try {
    const { programId, whatsappGroupId } = await request.json()

    if (!programId || !whatsappGroupId) {
      return NextResponse.json(
        { error: 'programId and whatsappGroupId are required' },
        { status: 400 }
      )
    }

    const program = await linkWhatsAppGroup(programId, whatsappGroupId)

    if (!program) {
      return NextResponse.json(
        { error: 'Program not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      programId: program.id,
      whatsappGroupId: program.whatsapp_group_id,
    })
  } catch (error) {
    console.error('Link WhatsApp error:', error)
    return NextResponse.json(
      { error: 'Failed to link WhatsApp group' },
      { status: 500 }
    )
  }
}
