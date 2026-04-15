import { NextRequest, NextResponse } from 'next/server'
import { createProgram, type Knowledgebase } from '@/app/lib/db'
import { getCoachIdFromRequest } from '@/app/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const coachId = await getCoachIdFromRequest(request)
    if (!coachId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { programName, knowledgebase } = await request.json()

    if (!programName) {
      return NextResponse.json(
        { error: 'programName is required' },
        { status: 400 }
      )
    }

    const program = await createProgram(coachId, programName, knowledgebase as Knowledgebase | undefined)

    return NextResponse.json({
      success: true,
      programId: program.id,
      programName: program.program_name,
    })
  } catch (error) {
    console.error('Create program error:', error)
    return NextResponse.json(
      { error: 'Failed to create program. Please try again.' },
      { status: 500 }
    )
  }
}
