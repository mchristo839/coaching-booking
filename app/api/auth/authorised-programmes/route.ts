// app/api/auth/authorised-programmes/route.ts
// Returns the list of programmes the logged-in coach can act on
// (post promotions, create polls/fixtures, cancel sessions, etc).
// Used by the Control Centre forms to populate the "Send To" picker.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest, signJwt, setAuthCookie } from '@/app/lib/auth'
import { findCoachByProviderId } from '@/app/lib/db'
import { getAuthorisedProgrammes } from '@/app/lib/permissions'

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Self-heal: a JWT signed before the coach_v2 row was created will have
  // coachId=null. Fall back to looking up the coach via provider_id so the
  // nav-authority check (Referrals, Control Centre) doesn't silently hide
  // links for coaches with a valid profile.
  let resolvedCoachId = auth.coachId
  let jwtNeedsRefresh = false
  if (!resolvedCoachId) {
    const coach = await findCoachByProviderId(auth.providerId)
    if (!coach) {
      return NextResponse.json({ programmes: [] })
    }
    resolvedCoachId = coach.id as string
    jwtNeedsRefresh = true
  }

  try {
    const programmes = await getAuthorisedProgrammes(resolvedCoachId)
    const response = NextResponse.json({ programmes })
    if (jwtNeedsRefresh) {
      const token = await signJwt(auth.providerId, resolvedCoachId)
      setAuthCookie(response, token)
    }
    return response
  } catch (error) {
    console.error('[AUTH-PROGRAMMES] error:', error)
    return NextResponse.json(
      { error: 'Failed to load authorised programmes' },
      { status: 500 }
    )
  }
}
