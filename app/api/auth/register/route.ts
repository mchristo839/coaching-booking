import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createProvider, findProviderByEmail } from '@/app/lib/db'
import { signJwt, setAuthCookie } from '@/app/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { firstName, lastName, email, password, mobileWhatsapp, tradingName, townCity, postcode, referralSource } = body

    if (!firstName || !email || !password) {
      return NextResponse.json({ error: 'First name, email and password are required' }, { status: 400 })
    }

    const existing = await findProviderByEmail(email)
    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 400 })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const provider = await createProvider({
      firstName,
      lastName: lastName || '',
      email,
      passwordHash,
      mobileWhatsapp: mobileWhatsapp || '',
      tradingName,
      townCity,
      postcode,
      referralSource,
    })

    // Sign JWT and set HTTP-only cookie
    const token = await signJwt(provider.id)
    const response = NextResponse.json({
      success: true,
      providerId: provider.id,
      email: provider.email,
      firstName: provider.first_name,
      lastName: provider.last_name,
    })
    setAuthCookie(response, token)
    return response
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
  }
}
