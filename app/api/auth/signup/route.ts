import { NextRequest, NextResponse } from 'next/server'
import { findCoachByEmail, createCoach } from '@/app/lib/db'
import { signJwt, setAuthCookie } from '@/app/lib/auth'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  try {
    const { email, name, password } = await request.json()

    if (!email || !name || !password) {
      return NextResponse.json(
        { error: 'Email, name, and password are required' },
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
    const coach = await createCoach(email, name, passwordHash)

    const token = await signJwt(coach.id)
    const response = NextResponse.json({
      success: true,
      coachId: coach.id,
      email: coach.email,
      name: coach.name,
    })
    return setAuthCookie(response, token)
  } catch (error: any) {
    console.error('Signup error:', error?.message)
    return NextResponse.json(
      { error: 'Failed to create account. Please try again.' },
      { status: 500 }
    )
  }
}
