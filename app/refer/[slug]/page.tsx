'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'

interface PromotionPublic {
  title: string | null
  detail: string
  venue: string | null
  startAt: string | null
  endAt: string | null
  isFree: boolean
  status: string
  closed?: boolean
}

interface ReferrerContact {
  id: string
  display_name: string
}

const OTHER_REFERRER = '__other__'

export default function PublicReferralPage() {
  const params = useParams()
  const slug = params.slug as string
  const [promotion, setPromotion] = useState<PromotionPublic | null>(null)
  const [contacts, setContacts] = useState<ReferrerContact[]>([])
  const [contactsLoaded, setContactsLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const [friendFirstName, setFriendFirstName] = useState('')
  const [childName, setChildName] = useState('')
  const [friendEmail, setFriendEmail] = useState('')
  const [friendPhone, setFriendPhone] = useState('')
  // Selected dropdown value: a member id, '__other__', or '' (unset).
  const [referrerSelection, setReferrerSelection] = useState('')
  // Free-text fallback shown when 'Other' is picked or no contacts loaded.
  const [referredByName, setReferredByName] = useState('')
  // ?ref=<memberId> from a link DM'd directly to a member — pre-attributes the
  // referral to them. Read client-side to avoid a useSearchParams Suspense
  // boundary. The server still validates the id belongs to this programme.
  const [refParam, setRefParam] = useState<string | null>(null)

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

  const loadContacts = useCallback(async () => {
    try {
      const res = await fetch(`/api/referrals/public/${slug}/contacts`)
      if (res.ok) {
        const data = await res.json()
        setContacts(Array.isArray(data.contacts) ? data.contacts : [])
      }
    } catch {
      // Silent — page degrades to free-text input on failure (AC-R02).
    } finally {
      setContactsLoaded(true)
    }
  }, [slug])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadContacts() }, [loadContacts])

  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get('ref')
    if (r) setRefParam(r)
  }, [])

  // Pre-select the referrer dropdown when the link carried a valid ?ref.
  useEffect(() => {
    if (refParam && contacts.some((c) => c.id === refParam)) {
      setReferrerSelection(refParam)
    }
  }, [refParam, contacts])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    // Resolve the dropdown selection into the two server fields. When the
    // user picked a real contact, send the member id; otherwise send the
    // free-text fallback. Server treats either as valid and verifies the
    // member id belongs to this programme.
    const dropdownAvailable = contacts.length > 0
    const usingDropdown = dropdownAvailable && referrerSelection && referrerSelection !== OTHER_REFERRER
    // Priority: an explicit dropdown pick wins; otherwise, if the referrer was
    // left untouched and the link carried a ?ref, attribute to that member.
    const referrerMemberId = usingDropdown
      ? referrerSelection
      : (referrerSelection === '' && refParam ? refParam : null)
    const referredByNameToSend = (usingDropdown || referrerMemberId)
      ? null
      : (referredByName.trim() || null)

    try {
      const res = await fetch(`/api/referrals/public/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          friendFirstName,
          childName,
          friendEmail,
          friendPhone,
          referredByName: referredByNameToSend,
          referrerMemberId,
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
    return <div className="min-h-screen flex items-center justify-center bg-canvas"><p className="text-ink-muted">Loading...</p></div>
  }

  if (!promotion) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas px-4">
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg max-w-md border border-red-100">{error || 'Not found'}</div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas px-4 py-12">
        <div className="reveal reveal-1 card shadow-card w-full max-w-md p-6 md:p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-brand-50 flex items-center justify-center">
            <svg className="w-8 h-8 text-brand-700" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="font-display text-2xl font-bold text-ink mb-3">You&apos;re in!</h1>
          <p className="text-ink-muted leading-relaxed">
            We&apos;ve got your details. The coach will be in touch shortly with the session info.
          </p>
        </div>
      </div>
    )
  }

  // Spec AC-R11: campaign closed after end_at. Render a friendly closed
  // state instead of the form — no submissions accepted, no broken UX.
  if (promotion.closed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas px-4 py-12">
        <div className="reveal reveal-1 card shadow-card w-full max-w-md p-6 md:p-8 text-center">
          <h1 className="font-display text-2xl font-bold text-ink mb-3">This offer has closed</h1>
          <p className="text-ink-muted leading-relaxed">
            Thanks for your interest in {promotion.title || 'this offer'}. Bookings are no longer open
            for this campaign — get in touch with the coach directly if you&apos;d still like to come along.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-canvas px-4 py-12 flex items-start justify-center">
      <div className="reveal reveal-1 card shadow-card w-full max-w-md p-6 md:p-8">
        <span className="eyebrow mb-3">You&apos;re invited</span>
        <h1 className="font-display text-2xl font-bold text-ink mb-2 tracking-[-0.01em]">
          {promotion.title || 'Free taster session'}
        </h1>
        <p className="text-ink-muted mb-4 leading-relaxed">{promotion.detail}</p>
        {promotion.venue && <p className="text-sm text-ink-muted mb-1">📍 {promotion.venue}</p>}
        {promotion.startAt && (
          <p className="text-sm text-ink-muted mb-4">
            🗓 {new Date(promotion.startAt).toLocaleString('en-GB')}
          </p>
        )}

        {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm border border-red-100">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Child&apos;s first name *</label>
            <input
              type="text"
              value={childName}
              onChange={(e) => setChildName(e.target.value)}
              required
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Parent first name *</label>
            <input
              type="text"
              value={friendFirstName}
              onChange={(e) => setFriendFirstName(e.target.value)}
              required
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Mobile / WhatsApp *</label>
            <input
              type="tel"
              value={friendPhone}
              onChange={(e) => setFriendPhone(e.target.value)}
              required
              placeholder="07123 456789"
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Email</label>
            <input
              type="email"
              value={friendEmail}
              onChange={(e) => setFriendEmail(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Who referred you?</label>
            {!contactsLoaded ? (
              <div className="w-full px-4 py-3 border border-line rounded-lg text-ink-muted bg-surface-muted text-sm">
                Loading…
              </div>
            ) : contacts.length > 0 ? (
              <>
                <select
                  value={referrerSelection}
                  onChange={(e) => setReferrerSelection(e.target.value)}
                  className="input-field"
                >
                  <option value="">Pick from list…</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>{c.display_name}</option>
                  ))}
                  <option value={OTHER_REFERRER}>Other / not on this list</option>
                </select>
                {referrerSelection === OTHER_REFERRER && (
                  <input
                    type="text"
                    value={referredByName}
                    onChange={(e) => setReferredByName(e.target.value)}
                    placeholder="Type the parent's name"
                    className="input-field mt-2"
                  />
                )}
              </>
            ) : (
              <input
                type="text"
                value={referredByName}
                onChange={(e) => setReferredByName(e.target.value)}
                placeholder="Parent name"
                className="input-field"
              />
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full"
          >
            {submitting ? 'Submitting...' : 'Claim my spot'}
          </button>
        </form>
      </div>
    </div>
  )
}
