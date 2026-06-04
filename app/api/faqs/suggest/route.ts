// app/api/faqs/suggest/route.ts
// POST: draft FAQ suggestions from a programme's own chat history (per-programme,
// coach-approved learning). Inserts `pending_coach_approval` FAQs for the coach to
// review on the Learning page. Accepts { programmeId } for one, or { coachId } for
// all of that coach's programmes.

import { NextRequest, NextResponse } from 'next/server'
import { suggestFaqsForProgramme } from '@/app/lib/faq-learning'
import { listProgrammesByCoach } from '@/app/lib/db'

export async function POST(request: NextRequest) {
  try {
    const { programmeId, coachId } = await request.json()

    if (programmeId) {
      const r = await suggestFaqsForProgramme(programmeId)
      return NextResponse.json({ added: r.added, reviewed: r.reviewed, programmes: 1 })
    }

    if (coachId) {
      const programmes = await listProgrammesByCoach(coachId)
      let added = 0
      let reviewed = 0
      for (const p of programmes) {
        const r = await suggestFaqsForProgramme(p.id as string)
        added += r.added
        reviewed += r.reviewed
      }
      return NextResponse.json({ added, reviewed, programmes: programmes.length })
    }

    return NextResponse.json({ error: 'programmeId or coachId required' }, { status: 400 })
  } catch (error) {
    console.error('[FAQ suggest] error:', error)
    return NextResponse.json({ error: 'Failed to generate suggestions' }, { status: 500 })
  }
}
