import { NextRequest, NextResponse } from 'next/server'
import { createCoach, updateProvider } from '@/app/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { providerId, firstName, lastName, email, mobile, sport, coachingLevel, dbsStatus, dbsIssueDate, governingBody, firstAid, publicLiability } = body

    if (!providerId || !firstName || !email) {
      return NextResponse.json({ error: 'Provider ID, first name and email are required' }, { status: 400 })
    }

    const coach = await createCoach({
      providerId,
      firstName,
      lastName: lastName || '',
      email,
      mobile: mobile || '',
      sport,
      coachingLevel,
      dbsStatus,
      dbsIssueDate,
      governingBody,
      firstAid,
      publicLiability,
    })

    await updateProvider(providerId, { registrationStatus: 'coach_added' })

    return NextResponse.json({
      success: true,
      coachId: coach.id,
      providerId,
    })
  } catch (error) {
    console.error('Create coach error:', error)
    return NextResponse.json({ error: 'Failed to create coach profile' }, { status: 500 })
  }
}
