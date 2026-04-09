export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { listPendingFaqsByCoach, updateFaq, createFaq, listFaqsByProgramme } from '@/app/lib/db'

// GET: list FAQs (pending for coach, or all for a programme)
export async function GET(request: NextRequest) {
  try {
    const coachId = request.nextUrl.searchParams.get('coachId')
    const programmeId = request.nextUrl.searchParams.get('programmeId')
    const status = request.nextUrl.searchParams.get('status')

    if (coachId && !programmeId) {
      // Get pending FAQs across all coach's programmes
      const faqs = await listPendingFaqsByCoach(coachId)
      return NextResponse.json({ faqs })
    }

    if (programmeId) {
      const faqs = await listFaqsByProgramme(programmeId, status || undefined)
      return NextResponse.json({ faqs })
    }

    return NextResponse.json({ error: 'coachId or programmeId required' }, { status: 400 })
  } catch (error) {
    console.error('List FAQs error:', error)
    return NextResponse.json({ error: 'Failed to list FAQs' }, { status: 500 })
  }
}

// POST: create a new FAQ
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { programmeId, question, answer, category, source, status } = body

    if (!programmeId || !question || !answer) {
      return NextResponse.json({ error: 'Programme ID, question and answer required' }, { status: 400 })
    }

    const faq = await createFaq({ programmeId, question, answer, category, source, status })
    return NextResponse.json({ success: true, faq })
  } catch (error) {
    console.error('Create FAQ error:', error)
    return NextResponse.json({ error: 'Failed to create FAQ' }, { status: 500 })
  }
}

// PATCH: update/approve a FAQ
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { faqId, question, answer, status } = body

    if (!faqId) {
      return NextResponse.json({ error: 'FAQ ID required' }, { status: 400 })
    }

    const faq = await updateFaq(faqId, { question, answer, status })
    return NextResponse.json({ success: true, faq })
  } catch (error) {
    console.error('Update FAQ error:', error)
    return NextResponse.json({ error: 'Failed to update FAQ' }, { status: 500 })
  }
}
