export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { listProgrammesByCoach, listFaqsByProgramme } from '@/app/lib/db'

export async function GET(request: NextRequest) {
  try {
    const coachId = request.nextUrl.searchParams.get('coachId')
    if (!coachId) {
      return NextResponse.json({ error: 'Coach ID required' }, { status: 400 })
    }

    const programmes = await listProgrammesByCoach(coachId)

    // Optionally include FAQs
    const includeFaqs = request.nextUrl.searchParams.get('includeFaqs') === 'true'
    if (includeFaqs) {
      for (const prog of programmes) {
        (prog as Record<string, unknown>).faqs = await listFaqsByProgramme(prog.id)
      }
    }

    return NextResponse.json({ programmes })
  } catch (error) {
    console.error('List programmes error:', error)
    return NextResponse.json({ error: 'Failed to list programmes' }, { status: 500 })
  }
}
