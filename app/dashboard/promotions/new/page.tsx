'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface AuthorisedProgramme {
  programme_id: string
  programme_name: string
  role: string
}

type PromoType = 'social_event' | 'refer_a_friend' | 'holiday_camp' | 'other'

const PROMO_TYPE_LABELS: Record<PromoType, string> = {
  social_event: 'Social Event',
  refer_a_friend: 'Refer a Friend',
  holiday_camp: 'Holiday Camp',
  other: 'Other',
}

export default function NewPromotionPage() {
  const router = useRouter()
  const [authorisedProgrammes, setAuthorisedProgrammes] = useState<AuthorisedProgramme[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [promotionType, setPromotionType] = useState<PromoType>('social_event')
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [venue, setVenue] = useState('')
  const [isFree, setIsFree] = useState(false)
  const [costGbp, setCostGbp] = useState('')
  const [paymentLink, setPaymentLink] = useState('')
  const [sendMode, setSendMode] = useState<'all_groups' | 'selected_groups'>('all_groups')
  const [selectedProgrammeIds, setSelectedProgrammeIds] = useState<string[]>([])

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/auth/authorised-programmes', { credentials: 'include' })
      if (res.status === 401) {
        router.push('/auth/login')
        return
      }
      const data = await res.json()
      setAuthorisedProgrammes(data.programmes || [])
      setLoading(false)
    }
    load()
  }, [router])

  function toggleProgramme(id: string) {
    setSelectedProgrammeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    if (!detail.trim()) {
      setError('Please describe the promotion in the "What\'s it about?" field.')
      setSaving(false)
      return
    }

    if (sendMode === 'selected_groups' && selectedProgrammeIds.length === 0) {
      setError('Please select at least one programme.')
      setSaving(false)
      return
    }

    try {
      const res = await fetch('/api/promotions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promotionType,
          title: title.trim() || null,
          detail: detail.trim(),
          startAt: startAt || null,
          endAt: endAt || null,
          venue: venue.trim() || null,
          isFree,
          costGbp: isFree ? null : (costGbp ? parseFloat(costGbp) : null),
          paymentLink: paymentLink.trim() || null,
          sendMode,
          programmeIds: sendMode === 'selected_groups' ? selectedProgrammeIds : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to create promotion')
        return
      }
      router.push(`/dashboard/promotions/${data.promotion.id}`)
    } catch {
      setError('Failed to create promotion')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  if (authorisedProgrammes.length === 0) {
    return (
      <div className="min-h-screen px-4 py-6 md:px-8 max-w-3xl mx-auto">
        <div className="bg-yellow-50 text-yellow-800 px-4 py-3 rounded-lg">
          You don&apos;t have authority over any programmes.
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-6 md:px-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/control-centre" className="text-gray-500 hover:text-gray-700 text-sm">
          ← Control Centre
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">New Promotion</h1>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Promotion type *</label>
            <select
              value={promotionType}
              onChange={(e) => setPromotionType(e.target.value as PromoType)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900"
            >
              {(Object.keys(PROMO_TYPE_LABELS) as PromoType[]).map((t) => (
                <option key={t} value={t}>{PROMO_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title (optional)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="AI will generate one if left blank"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">What&apos;s it about? *</label>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={3}
              required
              placeholder="e.g. Summer football camp for Under-10s. 3 days of coaching, 10am-3pm, lunch included."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start date/time</label>
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End date/time</label>
              <input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Venue</label>
            <input
              type="text"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="e.g. Victoria Park, London E9 7BT"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-2 text-sm text-gray-700 mb-1">
                <input
                  type="checkbox"
                  checked={isFree}
                  onChange={(e) => setIsFree(e.target.checked)}
                  className="w-4 h-4"
                />
                Free event
              </label>
              {!isFree && (
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={costGbp}
                  onChange={(e) => setCostGbp(e.target.value)}
                  placeholder="Cost in £"
                  className="mt-1 w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900"
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment / booking link</label>
              <input
                type="url"
                value={paymentLink}
                onChange={(e) => setPaymentLink(e.target.value)}
                placeholder="https://..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Send to</h2>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="radio"
              checked={sendMode === 'all_groups'}
              onChange={() => setSendMode('all_groups')}
            />
            All my groups ({authorisedProgrammes.length})
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="radio"
              checked={sendMode === 'selected_groups'}
              onChange={() => setSendMode('selected_groups')}
            />
            Select groups
          </label>

          {sendMode === 'selected_groups' && (
            <div className="ml-6 space-y-2 border-l-2 border-gray-200 pl-4">
              {authorisedProgrammes.map((p) => (
                <label key={p.programme_id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedProgrammeIds.includes(p.programme_id)}
                    onChange={() => toggleProgramme(p.programme_id)}
                  />
                  <span>{p.programme_name}</span>
                  <span className="text-xs text-gray-400">({p.role.replace('_', ' ')})</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Generating...' : 'Generate & preview'}
          </button>
          <Link
            href="/dashboard/control-centre"
            className="bg-gray-100 text-gray-700 px-6 py-3 rounded-lg font-medium hover:bg-gray-200"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
