import { NextRequest, NextResponse } from 'next/server'
import { findProviderByEmail, findCoachByProviderId } from '@/app/lib/db'
import { signJwt, setAuthCookie } from '@/app/lib/auth'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const provider = await findProviderByEmail(email)
    if (!provider) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const passwordMatch = await bcrypt.compare(password, provider.password_hash)
    if (!passwordMatch) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    // Find the coach record linked to this provider
    const coach = await findCoachByProviderId(provider.id)

    // Sign JWT and set HTTP-only cookie
    const token = await signJwt(provider.id, coach?.id || undefined)
    const vertical: 'sport' | 'fitness' = (coach as { vertical?: string } | null)?.vertical === 'fitness' ? 'fitness' : 'sport'
    const response = NextResponse.json({
      success: true,
      providerId: provider.id,
      coachId: coach?.id || null,
      email: provider.email,
      name: `${provider.first_name} ${provider.last_name}`.trim(),
      tradingName: provider.trading_name,
      registrationStatus: provider.registration_status,
      vertical,
    })
    setAuthCookie(response, token)
    return response
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Login failed. Please try again.' }, { status: 500 })
  }
}
