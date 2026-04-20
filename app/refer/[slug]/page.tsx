'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'

interface PromotionPublic {
  title: string | null
  detail: string
  venue: string | null
  startAt: string | null
  isFree: boolean
  status: string
}

export default function PublicReferralPage() {
  const params = useParams()
  const slug = params.slug as string
  const [promotion, setPromotion] = useState<PromotionPublic | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const [friendFirstName, setFriendFirstName] = useState('')
  const [childName, setChildName] = useState('')
  const [friendEmail, setFriendEmail] = useState('')
  const [friendPhone, setFriendPhone] = useState('')
  const [referredByName, setReferredByName] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/referrals/public/${slug}`)
      if (!res.ok) {
        setError('This referral link is not valid or has expired.')
        return
      }
      const data = await res.json()
      setPromotion(data)
    } catch {
      setError('Failed to load referral details')
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => { load() }, [load])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const res = await fetch(`/api/referrals/public/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          friendFirstName, childName, friendEmail, friendPhone, referredByName,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to submit')
        return
      }
      setSubmitted(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-600">Loading...</p></div>
  }

  if (!promotion) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg max-w-md">{error || 'Not found'}</div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="bg-white rounded-xl shadow-sm w-full max-w-md p-6 md:p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">You&apos;re in!</h1>
          <p className="text-gray-600">
            We&apos;ve got your details. The coach will be in touch shortly with the session info.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-12 flex items-start justify-center">
      <div className="bg-white rounded-xl shadow-sm w-full max-w-md p-6 md:p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {promotion.title || 'Free taster session'}
        </h1>
        <p className="text-gray-600 mb-4">{promotion.detail}</p>
        {promotion.venue && <p className="text-sm text-gray-500 mb-1">📍 {promotion.venue}</p>}
        {promotion.startAt && (
          <p className="text-sm text-gray-500 mb-4">
            🗓 {new Date(promotion.startAt).toLocaleString('en-GB')}
          </p>
        )}

        {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-3 mt-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Your first name *</label>
            <input
              type="text"
              value={friendFirstName}
              onChange={(e) => setFriendFirstName(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Your child&apos;s name</label>
            <input
              type="text"
              value={childName}
              onChange={(e) => setChildName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
            <input
              type="tel"
              value={friendPhone}
              onChange={(e) => setFriendPhone(e.target.value)}
              required
              placeholder="07123 456789"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={friendEmail}
              onChange={(e) => setFriendEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Who told you about us?</label>
            <input
              type="text"
              value={referredByName}
              onChange={(e) => setReferredByName(e.target.value)}
              placeholder="Parent name"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Claim my spot'}
          </button>
        </form>
      </div>
    </div>
  )
}
