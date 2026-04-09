import { NextRequest, NextResponse } from 'next/server'
import { createProgramme, createFaqsBulk, updateProvider, findCoachById } from '@/app/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { coachId, faqs, ...programmeData } = body

    if (!coachId || !programmeData.programmeName) {
      return NextResponse.json({ error: 'Coach ID and programme name are required' }, { status: 400 })
    }

    const programme = await createProgramme({ coachId, ...programmeData })

    // Create FAQs if provided
    if (faqs && Array.isArray(faqs) && faqs.length > 0) {
      await createFaqsBulk(
        programme.id,
        faqs.map((f: { question: string; answer: string; category?: string; source?: string }) => ({
          question: f.question,
          answer: f.answer,
          category: f.category || 'custom',
          source: f.source || 'coach',
        }))
      )
    }

    // Update provider registration status
    const coach = await findCoachById(coachId)
    if (coach) {
      await updateProvider(coach.provider_id, { registrationStatus: 'programme_added' })
    }

    return NextResponse.json({
      success: true,
      programmeId: programme.id,
      programmeName: programme.programme_name,
    })
  } catch (error) {
    console.error('Create programme error:', error)
    return NextResponse.json({ error: 'Failed to create programme' }, { status: 500 })
  }
}
