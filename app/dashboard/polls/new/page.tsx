'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface AuthorisedProgramme {
  programme_id: string
  programme_name: string
}

export default function NewPollPage() {
  const router = useRouter()
  const [authorisedProgrammes, setAuthorisedProgrammes] = useState<AuthorisedProgramme[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState<string[]>(['Yes', 'No'])
  const [responseType, setResponseType] = useState<'single' | 'multiple'>('single')
  const [closesAt, setClosesAt] = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const [sendMode, setSendMode] = useState<'all_groups' | 'selected_groups'>('all_groups')
  const [selectedProgrammeIds, setSelectedProgrammeIds] = useState<string[]>([])
  // Flow 1 additions
  const [capacity, setCapacity] = useState('')
  const [sessionAt, setSessionAt] = useState('')
  const [yesOptionIndex, setYesOptionIndex] = useState(0)
  const [paymentLink, setPaymentLink] = useState('')

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/auth/authorised-programmes', { credentials: 'include' })
      if (res.status === 401) { router.push('/auth/login'); return }
      const data = await res.json()
      setAuthorisedProgrammes(data.programmes || [])
      setLoading(false)
    }
    load()
  }, [router])

  function addOption() {
    if (options.length < 6) setOptions([...options, ''])
  }

  function removeOption(i: number) {
    if (options.length > 2) setOptions(options.filter((_, idx) => idx !== i))
  }

  function updateOption(i: number, value: string) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)))
  }

  function toggleProgramme(id: string) {
    setSelectedProgrammeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const cleanOptions = options.map((o) => o.trim()).filter(Boolean)
    if (!question.trim() || cleanOptions.length < 2) {
      setError('Question and at least 2 options required')
      setSaving(false)
      return
    }
    if (sendMode === 'selected_groups' && selectedProgrammeIds.length === 0) {
      setError('Select at least one programme')
      setSaving(false)
      return
    }

    try {
      const res = await fetch('/api/polls', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question.trim(),
          options: cleanOptions,
          responseType,
          closesAt: closesAt || null,
          anonymous,
          sendMode,
          programmeIds: sendMode === 'selected_groups' ? selectedProgrammeIds : null,
          capacity: capacity || null,
          sessionAt: sessionAt || null,
          yesOptionIndex,
          paymentLink: paymentLink.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to send poll')
        return
      }
      router.push(`/dashboard/polls/${data.poll.id}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-canvas"><p className="text-ink-muted">Loading...</p></div>
  }

  return (
    <div className="min-h-screen bg-canvas px-4 py-8 md:px-8 max-w-3xl mx-auto">
      <div className="reveal reveal-1 flex items-center gap-3 mb-6">
        <Link href="/dashboard/control-centre" className="text-ink-muted hover:text-brand-700 text-sm transition-colors">← Control Centre</Link>
        <h1 className="font-display text-2xl font-bold text-ink">New Poll</h1>
      </div>

      {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm border border-red-100">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card shadow-card space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Question *</label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              required
              placeholder="e.g. Can your child make training on Saturday?"
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Options (2-6)</label>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-xs text-ink-muted pt-3 w-6">{String.fromCharCode(97 + i)})</span>
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => updateOption(i, e.target.value)}
                    placeholder={`Option ${i + 1}`}
                    className="input-field flex-1 py-2"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(i)}
                      className="text-red-500 hover:text-red-600 text-sm px-2 transition-colors"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {options.length < 6 && (
                <button
                  type="button"
                  onClick={addOption}
                  className="text-brand-700 text-sm hover:underline ml-8"
                >
                  + Add option
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Closes at (optional)</label>
              <input
                type="datetime-local"
                value={closesAt}
                onChange={(e) => setClosesAt(e.target.value)}
                className="input-field"
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="accent-brand-600" />
                Anonymous
              </label>
            </div>
          </div>
        </div>

        <div className="card shadow-card space-y-4">
          <h2 className="font-display text-lg font-semibold text-ink">Group session (optional)</h2>
          <p className="text-xs text-ink-muted -mt-2">
            For booking-style polls. Cap the seats, link payment, and the bot
            will auto-waitlist overflow + DM payment links to YES voters.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Capacity</label>
              <input
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                placeholder="e.g. 12"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Session date/time</label>
              <input
                type="datetime-local"
                value={sessionAt}
                onChange={(e) => setSessionAt(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Which option means YES?</label>
              <select
                value={yesOptionIndex}
                onChange={(e) => setYesOptionIndex(parseInt(e.target.value, 10))}
                className="input-field"
              >
                {options.map((opt, i) => (
                  <option key={i} value={i}>{String.fromCharCode(97 + i)}) {opt || `Option ${i + 1}`}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Payment link (optional)</label>
              <input
                type="url"
                value={paymentLink}
                onChange={(e) => setPaymentLink(e.target.value)}
                placeholder="https://monzo.me/yourname, Revolut or PayPal.me link"
                className="input-field"
              />
              <p className="mt-1 text-xs text-ink-muted">
                Paste your own Revolut, Monzo or PayPal link — it&apos;s DM&apos;d to anyone who votes YES.
              </p>
            </div>
          </div>
        </div>

        <div className="card shadow-card space-y-3">
          <h2 className="font-display text-lg font-semibold text-ink">Send to</h2>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="radio" checked={sendMode === 'all_groups'} onChange={() => setSendMode('all_groups')} className="accent-brand-600" />
            All my groups ({authorisedProgrammes.length})
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="radio" checked={sendMode === 'selected_groups'} onChange={() => setSendMode('selected_groups')} className="accent-brand-600" />
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
                  {p.programme_name}
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
            {saving ? 'Sending...' : 'Send poll'}
          </button>
          <Link href="/dashboard/control-centre" className="btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
