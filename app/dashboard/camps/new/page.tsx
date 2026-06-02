'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface AuthorisedProgramme {
  programme_id: string
  programme_name: string
}

interface CampDayRow {
  date: string
  label: string
  price_gbp: string
  capacity: string
}

// Keep the base64 payload sane — camp cards don't need to be huge.
const MAX_IMAGE_BYTES = 1_500_000

export default function NewCampPage() {
  const router = useRouter()
  const [authorisedProgrammes, setAuthorisedProgrammes] = useState<AuthorisedProgramme[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [venue, setVenue] = useState('')
  const [paymentLink, setPaymentLink] = useState('')
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [imageName, setImageName] = useState('')

  const [campDays, setCampDays] = useState<CampDayRow[]>([
    { date: '', label: '', price_gbp: '', capacity: '' },
  ])

  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions] = useState<string[]>(['Yes please', 'No thanks', 'Maybe'])
  const [yesOptionIndex, setYesOptionIndex] = useState(0)

  const [sendMode, setSendMode] = useState<'all_groups' | 'selected_groups'>('all_groups')
  const [selectedProgrammeIds, setSelectedProgrammeIds] = useState<string[]>([])

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

  function updateCampDay(i: number, patch: Partial<CampDayRow>) {
    setCampDays((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))
  }
  function addCampDay() {
    setCampDays((prev) => [...prev, { date: '', label: '', price_gbp: '', capacity: '' }])
  }
  function removeCampDay(i: number) {
    setCampDays((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)))
  }

  function updateOption(i: number, value: string) {
    setPollOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)))
  }
  function addOption() {
    if (pollOptions.length < 6) setPollOptions([...pollOptions, ''])
  }
  function removeOption(i: number) {
    if (pollOptions.length > 2) {
      setPollOptions(pollOptions.filter((_, idx) => idx !== i))
      if (yesOptionIndex >= pollOptions.length - 1) setYesOptionIndex(0)
    }
  }

  function toggleProgramme(id: string) {
    setSelectedProgrammeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  function onImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError('')
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Please choose an image file.'); return }
    if (file.size > MAX_IMAGE_BYTES) { setError('Image is too large — please use one under 1.5MB.'); return }
    const reader = new FileReader()
    reader.onload = () => {
      setImageDataUrl(typeof reader.result === 'string' ? reader.result : null)
      setImageName(file.name)
    }
    reader.readAsDataURL(file)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!detail.trim()) { setError('Add a short description.'); return }
    if (!paymentLink.trim()) { setError('Add a payment link (Monzo.me, Revolut, etc.).'); return }
    const days = campDays
      .filter((d) => d.date && d.price_gbp !== '')
      .map((d) => ({
        date: d.date,
        label: d.label.trim() || d.date,
        price_gbp: parseFloat(d.price_gbp),
        capacity: d.capacity ? parseInt(d.capacity, 10) : null,
      }))
      .filter((d) => !Number.isNaN(d.price_gbp))
    if (days.length === 0) { setError('Add at least one camp day with a date and price.'); return }
    const cleanOptions = pollOptions.map((o) => o.trim()).filter(Boolean)
    if (cleanOptions.length < 2) { setError('The poll needs at least 2 options.'); return }
    if (sendMode === 'selected_groups' && selectedProgrammeIds.length === 0) {
      setError('Select at least one group to post to.'); return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/camps', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || null,
          detail: detail.trim(),
          venue: venue.trim() || null,
          paymentLink: paymentLink.trim(),
          campDays: days,
          imageDataUrl: imageDataUrl || null,
          pollQuestion: pollQuestion.trim() || null,
          pollOptions: cleanOptions,
          yesOptionIndex,
          sendMode,
          programmeIds: sendMode === 'selected_groups' ? selectedProgrammeIds : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to create camp'); setSaving(false); return }
      router.push(`/dashboard/promotions/${data.promotion.id}`)
    } catch {
      setError('Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-canvas"><p className="text-ink-muted">Loading…</p></div>
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="font-display text-2xl font-bold text-ink mb-1">New summer camp</h1>
      <p className="text-sm text-ink-muted mb-6">
        One screen: describe the camp, add the days, and post it as a poll. Anyone who votes
        <strong> yes</strong> gets the 1:1 booking chat automatically.
      </p>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm border border-red-100">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Description + image */}
        <div className="card shadow-card space-y-4">
          <h2 className="font-display text-lg font-semibold text-ink">The camp</h2>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Camp name</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Summer Camp" className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Description *</label>
            <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={3} required
              placeholder="e.g. 3 days of strength & conditioning, 10am–3pm daily. Pick any combination of days."
              className="input-field" />
            <p className="text-xs text-ink-muted mt-1.5">Shown as the caption with your image and used for the bot&apos;s answers.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Venue</label>
            <input type="text" value={venue} onChange={(e) => setVenue(e.target.value)}
              placeholder="e.g. Zenith Fitness, London E9 7BT" className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Image (optional)</label>
            <input type="file" accept="image/*" onChange={onImageChange}
              className="block w-full text-sm text-ink-muted file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100" />
            {imageDataUrl && (
              <div className="mt-3 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageDataUrl} alt="Camp preview" className="h-20 w-20 object-cover rounded-lg border border-line" />
                <div className="text-xs text-ink-muted">
                  <div className="truncate max-w-[180px]">{imageName}</div>
                  <button type="button" onClick={() => { setImageDataUrl(null); setImageName('') }}
                    className="text-red-600 hover:underline mt-1">Remove</button>
                </div>
              </div>
            )}
            <p className="text-xs text-ink-muted mt-1.5">Posted to the group with the poll. Max 1.5MB.</p>
          </div>
        </div>

        {/* Bookable days */}
        <div className="card shadow-card space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="font-display text-lg font-semibold text-ink">Bookable days</h2>
            <button type="button" onClick={addCampDay} className="text-brand-700 text-sm font-medium hover:underline">+ Add day</button>
          </div>
          <p className="text-sm text-ink-muted">Each day a parent can book — with its price and how many spots. Capacity drops only when you confirm a payment.</p>
          {campDays.map((row, i) => (
            <div key={i} className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end border border-line rounded-lg p-3">
              <div className="col-span-2 sm:col-span-3">
                <label className="block text-xs text-ink-muted mb-1">Date</label>
                <input type="date" value={row.date} onChange={(e) => updateCampDay(i, { date: e.target.value })} className="input-field py-2 text-sm" />
              </div>
              <div className="col-span-2 sm:col-span-4">
                <label className="block text-xs text-ink-muted mb-1">Label</label>
                <input type="text" value={row.label} onChange={(e) => updateCampDay(i, { label: e.target.value })} placeholder="Mon 15 Jun" className="input-field py-2 text-sm" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-ink-muted mb-1">Price £</label>
                <input type="number" step="0.01" min="0" value={row.price_gbp} onChange={(e) => updateCampDay(i, { price_gbp: e.target.value })} placeholder="30" className="input-field py-2 text-sm" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-ink-muted mb-1">Capacity</label>
                <input type="number" min="1" value={row.capacity} onChange={(e) => updateCampDay(i, { capacity: e.target.value })} placeholder="20" className="input-field py-2 text-sm" />
              </div>
              <div className="sm:col-span-1 flex sm:justify-center">
                {campDays.length > 1 && (
                  <button type="button" onClick={() => removeCampDay(i)} className="text-red-500 text-xs hover:underline">Remove</button>
                )}
              </div>
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Payment link *</label>
            <input type="url" value={paymentLink} onChange={(e) => setPaymentLink(e.target.value)} required
              placeholder="https://monzo.me/yourname, Revolut or PayPal.me link" className="input-field" />
          </div>
        </div>

        {/* The poll */}
        <div className="card shadow-card space-y-4">
          <h2 className="font-display text-lg font-semibold text-ink">The poll</h2>
          <p className="text-sm text-ink-muted -mt-2">This is what posts to the group. A <strong>yes</strong> vote starts the booking chat.</p>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Poll question</label>
            <input type="text" value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)}
              placeholder={title ? `${title} — interested?` : 'Summer Camp — interested?'} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Options</label>
            <div className="space-y-2">
              {pollOptions.map((opt, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input type="text" value={opt} onChange={(e) => updateOption(i, e.target.value)} placeholder={`Option ${i + 1}`} className="input-field py-2 text-sm" />
                  {pollOptions.length > 2 && (
                    <button type="button" onClick={() => removeOption(i)} className="text-red-500 text-xs hover:underline">Remove</button>
                  )}
                </div>
              ))}
            </div>
            {pollOptions.length < 6 && (
              <button type="button" onClick={addOption} className="text-brand-700 text-sm font-medium hover:underline mt-2">+ Add option</button>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Which option means YES?</label>
            <select value={yesOptionIndex} onChange={(e) => setYesOptionIndex(parseInt(e.target.value, 10))} className="input-field">
              {pollOptions.map((opt, i) => (
                <option key={i} value={i}>{String.fromCharCode(97 + i)}) {opt || `Option ${i + 1}`}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Where to post */}
        <div className="card shadow-card space-y-3">
          <h2 className="font-display text-lg font-semibold text-ink">Post to</h2>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2 text-ink">
              <input type="radio" checked={sendMode === 'all_groups'} onChange={() => setSendMode('all_groups')} /> All my groups
            </label>
            <label className="flex items-center gap-2 text-ink">
              <input type="radio" checked={sendMode === 'selected_groups'} onChange={() => setSendMode('selected_groups')} /> Selected groups
            </label>
          </div>
          {sendMode === 'selected_groups' && (
            <div className="space-y-1">
              {authorisedProgrammes.map((p) => (
                <label key={p.programme_id} className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" checked={selectedProgrammeIds.includes(p.programme_id)} onChange={() => toggleProgramme(p.programme_id)} />
                  {p.programme_name}
                </label>
              ))}
              {authorisedProgrammes.length === 0 && <p className="text-sm text-ink-muted">No groups linked yet.</p>}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="btn-primary px-8">
            {saving ? 'Posting…' : 'Create & post camp'}
          </button>
          <button type="button" onClick={() => router.push('/dashboard/promotions')} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  )
}
