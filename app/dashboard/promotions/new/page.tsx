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

  // Holiday camp: list of bookable days. Each row is one bookable session.
  interface CampDayRow { date: string; label: string; price_gbp: string; capacity: string }
  const [campDays, setCampDays] = useState<CampDayRow[]>([
    { date: '', label: '', price_gbp: '', capacity: '' },
  ])
  function updateCampDay(i: number, patch: Partial<CampDayRow>) {
    setCampDays((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))
  }
  function addCampDay() {
    setCampDays((prev) => [...prev, { date: '', label: '', price_gbp: '', capacity: '' }])
  }
  function removeCampDay(i: number) {
    setCampDays((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)))
  }
  // Derive a readable label like "Tue 7 Apr" if the coach doesn't override.
  function deriveLabel(dateStr: string): string {
    if (!dateStr) return ''
    const d = new Date(dateStr + 'T00:00:00')
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  }

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

    // Camp-specific validation: at least one day with a date + price.
    let cleanCampDays: { date: string; label: string; price_gbp: number; capacity: number | null }[] | null = null
    if (promotionType === 'holiday_camp') {
      const rows = campDays
        .map((r) => ({
          date: r.date,
          label: r.label.trim() || deriveLabel(r.date),
          price_gbp: parseFloat(r.price_gbp),
          capacity: r.capacity ? parseInt(r.capacity, 10) : null,
        }))
        .filter((r) => r.date && !Number.isNaN(r.price_gbp))
      if (rows.length === 0) {
        setError('Add at least one camp day with a date and price.')
        setSaving(false)
        return
      }
      if (!paymentLink.trim()) {
        setError('Holiday camps need a payment link (Monzo / Revolut / bank link) so the bot can share it after booking.')
        setSaving(false)
        return
      }
      cleanCampDays = rows
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
          campDays: cleanCampDays,
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
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <p className="text-ink-muted">Loading...</p>
      </div>
    )
  }

  if (authorisedProgrammes.length === 0) {
    return (
      <div className="min-h-screen bg-canvas px-4 py-8 md:px-8 max-w-3xl mx-auto">
        <div className="bg-amber-50 text-amber-800 px-4 py-3 rounded-lg border border-amber-100">
          You don&apos;t have authority over any programmes.
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-canvas px-4 py-8 md:px-8 max-w-3xl mx-auto">
      <div className="reveal reveal-1 flex items-center gap-3 mb-6">
        <Link href="/dashboard/control-centre" className="text-ink-muted hover:text-brand-700 text-sm transition-colors">
          ← Control Centre
        </Link>
        <h1 className="font-display text-2xl font-bold text-ink">New Promotion</h1>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm border border-red-100">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card shadow-card space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Promotion type *</label>
            <select
              value={promotionType}
              onChange={(e) => setPromotionType(e.target.value as PromoType)}
              className="input-field"
            >
              {(Object.keys(PROMO_TYPE_LABELS) as PromoType[]).map((t) => (
                <option key={t} value={t}>{PROMO_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Title (optional)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="AI will generate one if left blank"
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">What&apos;s it about? *</label>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={3}
              required
              placeholder="e.g. Summer football camp for Under-10s. 3 days of coaching, 10am-3pm, lunch included."
              className="input-field"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Start date/time</label>
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">End date/time</label>
              <input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className="input-field"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Venue</label>
            <input
              type="text"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="e.g. Victoria Park, London E9 7BT"
              className="input-field"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {promotionType !== 'holiday_camp' && (
              <div>
                <label className="flex items-center gap-2 text-sm text-ink mb-1">
                  <input
                    type="checkbox"
                    checked={isFree}
                    onChange={(e) => setIsFree(e.target.checked)}
                    className="w-4 h-4 accent-brand-600"
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
                    className="input-field mt-1"
                  />
                )}
              </div>
            )}
            <div className={promotionType === 'holiday_camp' ? 'sm:col-span-2' : ''}>
              <label className="block text-sm font-medium text-ink mb-1.5">
                Payment / booking link{promotionType === 'holiday_camp' && ' *'}
              </label>
              <input
                type="url"
                value={paymentLink}
                onChange={(e) => setPaymentLink(e.target.value)}
                placeholder={promotionType === 'holiday_camp' ? 'https://monzo.me/yourname, Revolut or PayPal.me link' : 'https://...'}
                className="input-field"
              />
              {promotionType === 'holiday_camp' && (
                <p className="mt-1 text-xs text-ink-muted">
                  Shared with parents after they pick their days. They&apos;ll be asked to use the child&apos;s name as the bank reference.
                </p>
              )}
            </div>
          </div>
        </div>

        {promotionType === 'holiday_camp' && (
          <div className="card shadow-card space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink">Camp days</h2>
              <button
                type="button"
                onClick={addCampDay}
                className="text-sm text-brand-700 hover:underline font-medium"
              >
                + Add day
              </button>
            </div>
            <p className="text-xs text-ink-muted">
              Each row is one bookable day. Parents will see these as options (a, b, c…) and pick any combination for each child.
            </p>
            <div className="space-y-2">
              {campDays.map((row, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-4">
                    <input
                      type="date"
                      value={row.date}
                      onChange={(e) => updateCampDay(i, { date: e.target.value })}
                      className="input-field px-2 py-2 text-sm"
                    />
                  </div>
                  <div className="col-span-4">
                    <input
                      type="text"
                      value={row.label}
                      onChange={(e) => updateCampDay(i, { label: e.target.value })}
                      placeholder={deriveLabel(row.date) || 'Label (e.g. Tue 7 Apr)'}
                      className="input-field px-2 py-2 text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.price_gbp}
                      onChange={(e) => updateCampDay(i, { price_gbp: e.target.value })}
                      placeholder="£"
                      className="input-field px-2 py-2 text-sm"
                    />
                  </div>
                  <div className="col-span-1">
                    <input
                      type="number"
                      min="0"
                      value={row.capacity}
                      onChange={(e) => updateCampDay(i, { capacity: e.target.value })}
                      placeholder="Cap"
                      className="input-field px-2 py-2 text-sm"
                    />
                  </div>
                  <div className="col-span-1 flex items-center justify-end">
                    {campDays.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeCampDay(i)}
                        className="text-ink-muted hover:text-red-600 text-lg px-1 transition-colors"
                        title="Remove this day"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card shadow-card space-y-3">
          <h2 className="font-display text-lg font-semibold text-ink">Send to</h2>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="radio"
              checked={sendMode === 'all_groups'}
              onChange={() => setSendMode('all_groups')}
              className="accent-brand-600"
            />
            All my groups ({authorisedProgrammes.length})
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="radio"
              checked={sendMode === 'selected_groups'}
              onChange={() => setSendMode('selected_groups')}
              className="accent-brand-600"
            />
            Select groups
          </label>

          {sendMode === 'selected_groups' && (
            <div className="ml-6 space-y-2 border-l-2 border-line pl-4">
              {authorisedProgrammes.map((p) => (
                <label key={p.programme_id} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={selectedProgrammeIds.includes(p.programme_id)}
                    onChange={() => toggleProgramme(p.programme_id)}
                    className="accent-brand-600"
                  />
                  <span>{p.programme_name}</span>
                  <span className="text-xs text-ink-muted">({p.role.replace('_', ' ')})</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="btn-primary px-8"
          >
            {saving ? 'Generating...' : 'Generate & preview'}
          </button>
          <Link
            href="/dashboard/control-centre"
            className="btn-secondary"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
