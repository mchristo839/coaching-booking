import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { findProviderByEmail, createPasswordReset } from '@/app/lib/db'
import { sendEmail } from '@/app/lib/email'
import { getPublicAppUrl } from '@/app/lib/urls'

// Reset links are valid for 1 hour.
const TOKEN_TTL_MS = 60 * 60 * 1000

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const provider = await findProviderByEmail(email)

    // Only do work when the account exists, but ALWAYS return the same response
    // so this endpoint can't be used to enumerate which emails are registered.
    if (provider) {
      const token = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
      const expiresAt = new Date(Date.now() + TOKEN_TTL_MS)
      await createPasswordReset(provider.id, tokenHash, expiresAt)

      const link = `${getPublicAppUrl()}/auth/reset-password?token=${token}`
      const firstName = provider.first_name || 'there'
      await sendEmail({
        to: provider.email,
        subject: 'Reset your MyCoachingAssistant password',
        text:
          `Hi ${firstName},\n\n` +
          `We received a request to reset your MyCoachingAssistant password. ` +
          `Click the link below to choose a new one — it expires in 1 hour:\n\n` +
          `${link}\n\n` +
          `If you didn't request this, you can safely ignore this email; your password won't change.\n`,
        html:
          `<p>Hi ${firstName},</p>` +
          `<p>We received a request to reset your MyCoachingAssistant password. ` +
          `Click the button below to choose a new one — it expires in 1 hour.</p>` +
          `<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#1f6feb;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Reset password</a></p>` +
          `<p>Or paste this link into your browser:<br><a href="${link}">${link}</a></p>` +
          `<p style="color:#666;font-size:13px">If you didn't request this, you can safely ignore this email; your password won't change.</p>`,
      })
    }

    return NextResponse.json({
      success: true,
      message: 'If an account exists for that email, a reset link is on its way.',
    })
  } catch (error) {
    console.error('Forgot-password error:', error)
    // Still return a generic success-shaped message to avoid leaking internals.
    return NextResponse.json({
      success: true,
      message: 'If an account exists for that email, a reset link is on its way.',
    })
  }
}
