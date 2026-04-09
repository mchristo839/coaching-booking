import { NextRequest, NextResponse } from 'next/server'
import { updateProvider } from '@/app/lib/db'

export async function POST(request: NextRequest) {
  try {
    const { providerId } = await request.json()
    if (!providerId) {
      return NextResponse.json({ error: 'Provider ID required' }, { status: 400 })
    }

    // For MVP: directly verify (in production, this would validate a token/code)
    const provider = await updateProvider(providerId, {
      emailVerified: true,
      registrationStatus: 'email_verified',
    })

    return NextResponse.json({ success: true, provider })
  } catch (error) {
    console.error('Verify email error:', error)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
