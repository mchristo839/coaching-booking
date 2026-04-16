// app/api/auth/signup/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { findCoachByEmail, createCoach, createCoachWithInvite, validateInviteCode, useInviteCode } from '@/app/lib/db'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  try {
    const { email, name, password, inviteCode } = await request.json()

    if (!email || !name || !password) {
      return NextResponse.json(
        { error: 'Email, name, and password are required' },
        { status: 400 }
      )
    }

    // During beta, invite code is required
    if (!inviteCode) {
      return NextResponse.json(
        { error: 'An invite code is required to register during beta' },
        { status: 400 }
      )
    }

    // Validate the invite code
    const validation = await validateInviteCode(inviteCode)
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    const existing = await findCoachByEmail(email)

    if (existing) {
      return NextResponse.json(
        { error: 'A coach with this email already exists' },
        { status: 400 }
      )
    }

    const passwordHash = await bcrypt.hash(password, 10)

    // Create coach with invite code and tester flag
    const coach = await createCoachWithInvite(email, name, passwordHash, inviteCode)

    // Increment invite code usage
    await useInviteCode(inviteCode)

    return NextResponse.json({
      success: true,
      coachId: coach.id,
      email: coach.email,
      name: coach.name,
      isTester: true,
    })

  } catch (error: unknown) {
    const err = error as Error
    console.error('Signup error full details:', {
      message: err?.message,
      stack: err?.stack,
      name: err?.name,
    })
    return NextResponse.json(
      { error: 'Failed to create account. Please try again.' },
      { status: 500 }
    )
  }
}
