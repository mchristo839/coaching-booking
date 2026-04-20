// app/api/auth/authorised-programmes/route.ts
// Returns the list of programmes the logged-in coach can act on
// (post promotions, create polls/fixtures, cancel sessions, etc).
// Used by the Control Centre forms to populate the "Send To" picker.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/app/lib/auth'
import { getAuthorisedProgrammes } from '@/app/lib/permissions'

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  if (!auth.coachId) {
    return NextResponse.json({ programmes: [] })
  }

  try {
    const programmes = await getAuthorisedProgrammes(auth.coachId)
    return NextResponse.json({ programmes })
  } catch (error) {
    console.error('[AUTH-PROGRAMMES] error:', error)
    return NextResponse.json(
      { error: 'Failed to load authorised programmes' },
      { status: 500 }
    )
  }
}
