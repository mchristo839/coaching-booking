'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
        return
      }
      setSent(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-canvas">
      <div className="reveal reveal-1 card shadow-card w-full max-w-md p-6 md:p-8">
        <div className="mb-6 text-center">
          <span className="eyebrow">MyCoachingAssistant</span>
          <h1 className="mt-3 font-display text-2xl font-bold text-ink">
            Reset your password
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Enter your email and we&apos;ll send you a link to set a new password.
          </p>
        </div>

        {sent ? (
          <div className="space-y-6">
            <div className="bg-green-50 text-green-800 px-4 py-3 rounded-lg text-sm border border-green-100">
              If an account exists for that email, a reset link is on its way. The
              link expires in 1 hour — check your inbox (and spam folder).
            </div>
            <Link href="/auth/login" className="btn-primary w-full inline-flex justify-center">
              Back to log in
            </Link>
          </div>
        ) : (
          <>
            {error && (
              <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm border border-red-100">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-ink mb-1.5">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="input-field"
                  placeholder="coach@example.com"
                />
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? 'Sending...' : 'Send reset link'}
              </button>
            </form>

            <p className="text-center text-sm text-ink-muted mt-6">
              Remembered it?{' '}
              <Link href="/auth/login" className="font-semibold text-brand-700 hover:underline">
                Log in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
