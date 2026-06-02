'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Login failed')
        return
      }

      localStorage.setItem('coachId', data.coachId)
      localStorage.setItem('coachEmail', data.email)
      localStorage.setItem('coachName', data.name)
      if (data.providerId) localStorage.setItem('providerId', data.providerId)
      if (data.tradingName) localStorage.setItem('tradingName', data.tradingName)
      localStorage.setItem('coachVertical', data.vertical === 'fitness' ? 'fitness' : 'sport')

      const status = data.registrationStatus
      if (status !== 'complete' && status !== 'programme_added') {
        router.push('/register')
      } else {
        router.push('/dashboard')
      }
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
            Welcome back
          </h1>
          <p className="mt-1 text-sm text-ink-muted">Log in to your coaching assistant.</p>
        </div>

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

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-ink mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="input-field"
              placeholder="Your password"
            />
            <div className="mt-1.5 text-right">
              <Link href="/auth/forgot-password" className="text-sm font-medium text-brand-700 hover:underline">
                Forgot password?
              </Link>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full"
          >
            {loading ? 'Logging in...' : 'Log In'}
          </button>
        </form>

        <p className="text-center text-sm text-ink-muted mt-6">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="font-semibold text-brand-700 hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
