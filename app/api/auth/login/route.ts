import { NextRequest, NextResponse } from 'next/server'
import { findCoachByEmail } from '@/app/lib/db'
import { signJwt, setAuthCookie } from '@/app/lib/auth'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    const coach = await findCoachByEmail(email)

    if (!coach) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    const passwordMatch = await bcrypt.compare(password, coach.password_hash)

    if (!passwordMatch) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    const token = await signJwt(coach.id)
    const response = NextResponse.json({
      success: true,
      coachId: coach.id,
      email: coach.email,
      name: coach.name,
    })
    return setAuthCookie(response, token)
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Login failed. Please try again.' },
      { status: 500 }
    )
  }
}
