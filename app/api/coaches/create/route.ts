import { NextRequest, NextResponse } from 'next/server'
import { createCoach, updateProvider } from '@/app/lib/db'
import { signJwt, setAuthCookie } from '@/app/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const providerId = body.providerId
    const firstName = body.firstName
    const lastName = body.lastName
    const email = body.email
    const mobile = body.mobile

    if (!providerId || !firstName || !email) {
      return NextResponse.json({ error: 'Provider ID, first name and email are required' }, { status: 400 })
    }

    const coach = await createCoach({
      providerId,
      firstName,
      lastName: lastName || '',
      email,
      mobile: mobile || '',
      sport: body.sport || null,
      coachingLevel: body.coachingLevel || body.qualification || null,
      dbsStatus: body.dbsStatus || null,
      dbsIssueDate: body.dbsIssueDate || null,
      governingBody: body.governingBody || null,
      firstAid: body.firstAid || null,
      publicLiability: body.publicLiability || body.insurance || null,
    })

    await updateProvider(providerId, { registrationStatus: 'coach_added' })

    // Re-sign the JWT so the auth cookie now contains the new coachId.
    // Without this, the existing cookie has coachId=null and subsequent
    // programme-create calls would fail with "No coach profile linked".
    const token = await signJwt(providerId, coach.id)
    const response = NextResponse.json({
      success: true,
      coachId: coach.id,
      providerId,
    })
    setAuthCookie(response, token)
    return response
  } catch (error) {
    console.error('Create coach error:', error)
    return NextResponse.json({ error: 'Failed to create coach profile' }, { status: 500 })
  }
}
