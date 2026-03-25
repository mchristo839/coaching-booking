// app/api/programs/create/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createProgram, updateProgramFormUrl } from '@/app/lib/db'

const FORM_BASE_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSe2jW7EXI1OLCjhnKVU7Nha2a5dQMpfUCYAH39NNo2PygNViA/viewform'

// Google Form entry IDs
const ENTRY_PROGRAM_NAME = 'entry.2051996231'
const ENTRY_PROGRAM_ID = 'entry.1018023075'
const ENTRY_COACH_ID = 'entry.1525338853'

function buildFormUrl(programName: string, programId: string, coachId: string): string {
  const params = new URLSearchParams({
    [ENTRY_PROGRAM_NAME]: programName,
    [ENTRY_PROGRAM_ID]: programId,
    [ENTRY_COACH_ID]: coachId,
  })
  return `${FORM_BASE_URL}?${params.toString()}`
}

export async function POST(request: NextRequest) {
  try {
    const { coachId, programName } = await request.json()

    if (!coachId || !programName) {
      return NextResponse.json(
        { error: 'coachId and programName are required' },
        { status: 400 }
      )
    }

    // Create the program record
    const program = await createProgram(coachId, programName)

    // Build the pre-filled form URL
    const formUrl = buildFormUrl(programName, program.id, coachId)

    // Save the form URL back to the program
    await updateProgramFormUrl(program.id, formUrl)

    return NextResponse.json({
      success: true,
      programId: program.id,
      programName: program.program_name,
      formUrl,
    })
  } catch (error) {
    console.error('Create program error:', error)
    return NextResponse.json(
      { error: 'Failed to create program. Please try again.' },
      { status: 500 }
    )
  }
}
