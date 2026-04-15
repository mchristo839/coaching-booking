import { NextRequest, NextResponse } from 'next/server'
import { listProgramsByCoach } from '@/app/lib/db'
import { getCoachIdFromRequest } from '@/app/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const coachId = await getCoachIdFromRequest(request)
    if (!coachId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
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
