'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface AuthorisedProgramme {
  programme_id: string
  programme_name: string
}

type FixtureType = 'league' | 'friendly' | 'cup' | 'tournament' | 'other'

export default function NewFixturePage() {
  const router = useRouter()
  const [authorisedProgrammes, setAuthorisedProgrammes] = useState<AuthorisedProgramme[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [programmeId, setProgrammeId] = useState('')
  const [fixtureType, setFixtureType] = useState<FixtureType>('league')
  const [opposition, setOpposition] = useState('')
  const [homeAway, setHomeAway] = useState<'home' | 'away'>('home')
  const [kickoffAt, setKickoffAt] = useState('')
  const [meetAt, setMeetAt] = useState('')
  const [venue, setVenue] = useState('')
  const [kitNotes, setKitNotes] = useState('')
  const [withAvailabilityPoll, setWithAvailabilityPoll] = useState(true)

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/auth/authorised-programmes', { credentials: 'include' })
      if (res.status === 401) { router.push('/auth/login'); return }
      const data = await res.json()
      setAuthorisedProgrammes(data.programmes || [])
      if (data.programmes?.[0]) setProgrammeId(data.programmes[0].programme_id)
      setLoading(false)
    }
    load()
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch('/api/fixtures', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programmeId,
          fixtureType,
          opposition: opposition.trim() || null,
          homeAway,
          kickoffAt,
          meetAt: meetAt || null,
          venue: venue.trim() || null,
          kitNotes: kitNotes.trim() || null,
          withAvailabilityPoll,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to publish fixture')
        return
      }
      setSuccess('Fixture published to the group!')
      setTimeout(() => router.push('/dashboard/control-centre'), 1500)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-canvas"><p className="text-ink-muted">Loading...</p></div>

  return (
    <div className="min-h-screen bg-canvas px-4 py-8 md:px-8 max-w-3xl mx-auto">
      <div className="reveal reveal-1 flex items-center gap-3 mb-6">
        <Link href="/dashboard/control-centre" className="text-ink-muted hover:text-brand-700 text-sm transition-colors">← Control Centre</Link>
        <h1 className="font-display text-2xl font-bold text-ink">Publish Fixture</h1>
      </div>

      {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm border border-red-100">{error}</div>}
      {success && <div className="bg-brand-50 text-brand-700 px-4 py-3 rounded-lg mb-4 text-sm border border-brand-100">{success}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card shadow-card space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Programme (team) *</label>
            <select
              value={programmeId}
              onChange={(e) => setProgrammeId(e.target.value)}
              required
              className="input-field"
            >
              {authorisedProgrammes.map((p) => (
                <option key={p.programme_id} value={p.programme_id}>{p.programme_name}</option>
              ))}
            </select>
            <p className="text-xs text-ink-muted mt-1">Fixtures go to one group only.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Type *</label>
              <select
                value={fixtureType}
                onChange={(e) => setFixtureType(e.target.value as FixtureType)}
                className="input-field"
              >
                <option value="league">League match</option>
                <option value="friendly">Friendly</option>
                <option value="cup">Cup</option>
                <option value="tournament">Tournament</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Home / Away</label>
              <select
                value={homeAway}
                onChange={(e) => setHomeAway(e.target.value as 'home' | 'away')}
                className="input-field"
              >
                <option value="home">Home</option>
                <option value="away">Away</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Opposition</label>
            <input
              type="text"
              value={opposition}
              onChange={(e) => setOpposition(e.target.value)}
              placeholder="e.g. Richmond Rangers"
              className="input-field"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Kick-off *</label>
              <input
                type="datetime-local"
                value={kickoffAt}
                onChange={(e) => setKickoffAt(e.target.value)}
                required
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Meet at (optional)</label>
              <input
                type="datetime-local"
                value={meetAt}
                onChange={(e) => setMeetAt(e.target.value)}
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
              placeholder="e.g. Twickenham Stoop Pitch 3"
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Kit / what to bring</label>
            <textarea
              value={kitNotes}
              onChange={(e) => setKitNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Full kit, shin pads, water bottle"
              className="input-field"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={withAvailabilityPoll}
              onChange={(e) => setWithAvailabilityPoll(e.target.checked)}
              className="h-4 w-4 accent-brand-600"
            />
            Include an availability poll (parents can reply "a" Available or "b" Not available)
          </label>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="btn-primary px-8"
          >
            {saving ? 'Publishing...' : 'Publish fixture'}
          </button>
          <Link href="/dashboard/control-centre" className="btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
