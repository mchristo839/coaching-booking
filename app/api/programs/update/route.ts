import { NextRequest, NextResponse } from 'next/server'
import { updateProgram, findProgramWithCoach, type Knowledgebase } from '@/app/lib/db'
import { getCoachIdFromRequest } from '@/app/lib/auth'

export async function PATCH(request: NextRequest) {
  try {
    const coachId = await getCoachIdFromRequest(request)
    if (!coachId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { programId, programName, knowledgebase, whatsappGroupId } = await request.json()

    if (!programId) {
      return NextResponse.json({ error: 'programId is required' }, { status: 400 })
    }

    const owned = await findProgramWithCoach(programId, coachId)
    if (!owned) {
      return NextResponse.json({ error: 'Not authorized to update this program' }, { status: 403 })
    }

    const program = await updateProgram(programId, {
      programName,
      knowledgebase: knowledgebase as Knowledgebase | undefined,
      whatsappGroupId,
    })

    return NextResponse.json({ success: true, program })
  } catch (error) {
    console.error('Update program error:', error)
    return NextResponse.json({ error: 'Failed to update program' }, { status: 500 })
  }
}
