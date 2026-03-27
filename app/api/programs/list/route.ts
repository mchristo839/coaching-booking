// app/api/programs/list/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { listProgramsByCoach } from '@/app/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const coachId = searchParams.get('coachId')

    if (!coachId) {
      return NextResponse.json(
        { error: 'coachId is required' },
        { status: 400 }
      )
    }

    const rows = await listProgramsByCoach(coachId)

    const programs = rows.map((r) => ({
      id: r.id,
      programName: r.program_name,
      whatsappGroupId: r.whatsapp_group_id,
      knowledgebase: r.knowledgebase || null,
      isActive: r.is_active,
      createdAt: r.created_at,
    }))

    return NextResponse.json({ programs })
  } catch (error) {
    console.error('List programs error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch programs' },
      { status: 500 }
    )
  }
}
