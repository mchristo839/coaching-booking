import { NextRequest, NextResponse } from 'next/server'
import { updateProgram, type Knowledgebase } from '@/app/lib/db'

export async function PATCH(request: NextRequest) {
  try {
    const { programId, programName, knowledgebase, whatsappGroupId } = await request.json()

    if (!programId) {
      return NextResponse.json({ error: 'programId is required' }, { status: 400 })
    }

    const program = await updateProgram(programId, {
      programName,
      knowledgebase: knowledgebase as Knowledgebase | undefined,
      whatsappGroupId,
    })

    if (!program) {
      return NextResponse.json({ error: 'Program not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, program })
  } catch (error) {
    console.error('Update program error:', error)
    return NextResponse.json({ error: 'Failed to update program' }, { status: 500 })
  }
}
