import { NextRequest, NextResponse } from 'next/server'
import { updateProgramme, findProgramme } from '@/app/lib/db'

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { programmeId, ...fields } = body

    if (!programmeId) {
      return NextResponse.json({ error: 'Programme ID required' }, { status: 400 })
    }

    const existing = await findProgramme(programmeId)
    if (!existing) {
      return NextResponse.json({ error: 'Programme not found' }, { status: 404 })
    }

    const updated = await updateProgramme(programmeId, fields)
    return NextResponse.json({ success: true, programme: updated })
  } catch (error) {
    console.error('Update programme error:', error)
    return NextResponse.json({ error: 'Failed to update programme' }, { status: 500 })
  }
}
