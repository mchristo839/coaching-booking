'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not reset password. Please try again.')
        return
      }
      setDone(true)
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
            Choose a new password
          </h1>
        </div>

        {done ? (
          <div className="space-y-6">
            <div className="bg-green-50 text-green-800 px-4 py-3 rounded-lg text-sm border border-green-100">
              Your password has been reset. You can now log in with your new password.
            </div>
            <Link href="/auth/login" className="btn-primary w-full inline-flex justify-center">
              Log in
            </Link>
          </div>
        ) : !token ? (
          <div className="space-y-6">
            <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm border border-red-100">
              This reset link is missing its token. Please request a new one.
            </div>
            <Link href="/auth/forgot-password" className="btn-primary w-full inline-flex justify-center">
              Request a new link
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
                <label htmlFor="password" className="block text-sm font-medium text-ink mb-1.5">
                  New password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="input-field"
                  placeholder="Min 6 characters"
                />
              </div>

              <div>
                <label htmlFor="confirm" className="block text-sm font-medium text-ink mb-1.5">
                  Confirm new password
                </label>
                <input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={6}
                  className="input-field"
                  placeholder="Re-enter your password"
                />
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? 'Saving...' : 'Reset password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <p className="text-ink-muted">Loading...</p>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  )
}
