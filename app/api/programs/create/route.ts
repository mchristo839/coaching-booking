import { NextRequest, NextResponse } from 'next/server'
import { createProgram, type Knowledgebase } from '@/app/lib/db'

export async function POST(request: NextRequest) {
  try {
    const { coachId, programName, knowledgebase } = await request.json()

    if (!coachId || !programName) {
      return NextResponse.json(
        { error: 'coachId and programName are required' },
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
