import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { findValidPasswordReset, markPasswordResetUsed, updateProviderPassword } from '@/app/lib/db'

export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json()

    if (!token || !password) {
      return NextResponse.json({ error: 'Token and new password are required' }, { status: 400 })
    }
    if (typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const reset = await findValidPasswordReset(tokenHash)
    if (!reset) {
      return NextResponse.json(
        { error: 'This reset link is invalid or has expired. Please request a new one.' },
        { status: 400 },
      )
    }

    const passwordHash = await bcrypt.hash(password, 10)
    await updateProviderPassword(reset.provider_id, passwordHash)
    await markPasswordResetUsed(reset.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Reset-password error:', error)
    return NextResponse.json({ error: 'Could not reset password. Please try again.' }, { status: 500 })
  }
}
