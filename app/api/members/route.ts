export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { listMembersByCoach, listMembersByProgramme, createMember } from '@/app/lib/db'

export async function GET(request: NextRequest) {
  try {
    const coachId = request.nextUrl.searchParams.get('coachId')
    const programmeId = request.nextUrl.searchParams.get('programmeId')

    if (programmeId) {
      const members = await listMembersByProgramme(programmeId)
      return NextResponse.json({ members })
    }
    if (coachId) {
      const members = await listMembersByCoach(coachId)
      return NextResponse.json({ members })
    }

    return NextResponse.json({ error: 'coachId or programmeId required' }, { status: 400 })
  } catch (error) {
    console.error('List members error:', error)
    return NextResponse.json({ error: 'Failed to list members' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { programmeId, parentName, parentEmail, parentWhatsappId, parentPhone, childName, childDob, medicalFlag, status, waitlistPosition } = body

    if (!programmeId) {
      return NextResponse.json({ error: 'Programme ID required' }, { status: 400 })
    }

    const member = await createMember({
      programmeId,
      parentName,
      parentEmail,
      parentWhatsappId,
      parentPhone,
      childName,
      childDob,
      medicalFlag,
      status,
      waitlistPosition,
    })

    return NextResponse.json({ success: true, member })
  } catch (error) {
    console.error('Create member error:', error)
    return NextResponse.json({ error: 'Failed to create member' }, { status: 500 })
  }
}
