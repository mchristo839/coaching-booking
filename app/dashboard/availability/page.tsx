'use client'

// PT weekly availability page — coach picks day + start/end time blocks for
// the upcoming week; on Save the API generates calendar_slots and the
// WhatsApp booking flow can offer them to clients.

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Block {
  day_of_week: number  // 0=Mon, 6=Sun
  start_time: string   // 'HH:MM'
  end_time: string
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function mondayOfToday(): string {
  const d = new Date()
  const isoDay = (d.getDay() + 6) % 7  // Mon=0
  d.setDate(d.getDate() - isoDay)
  return d.toISOString().slice(0, 10)
}

function addWeeks(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n * 7)
  return d.toISOString().slice(0, 10)
}

function normaliseTime(value: string): string {
  // Coerce HH:MM (already from <input type="time">) but trim seconds if present.
  return value.slice(0, 5)
}

export default function AvailabilityPage() {
  const router = useRouter()
  const [weekCommencing, setWeekCommencing] = useState(mondayOfToday())
  const [blocks, setBlocks] = useState<Block[]>([])
  const [durationMin, setDurationMin] = useState(60)
  const [pricePerSlot, setPricePerSlot] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  const load = useCallback(async (wc: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/calendar/availability?weekCommencing=${wc}`, {
        credentials: 'include',
      })
      if (res.status === 401) {
        router.push('/auth/login')
        return
      }
      const data = await res.json()
      setBlocks(
        (data.blocks || []).map((b: { day_of_week: number; start_time: string; end_time: string }) => ({
          day_of_week: b.day_of_week,
          start_time: normaliseTime(b.start_time),
          end_time: normaliseTime(b.end_time),
        }))
      )
    } catch {
      setError('Failed to load availability')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => { load(weekCommencing) }, [load, weekCommencing])

  function addBlock(day: number) {
    setBlocks((prev) => [
      ...prev,
      { day_of_week: day, start_time: '09:00', end_time: '10:00' },
    ])
  }
  function updateBlock(i: number, patch: Partial<Block>) {
    setBlocks((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)))
  }
  function removeBlock(i: number) {
    setBlocks((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function save() {
    setSaving(true)
    setError('')
    setToast('')
    try {
      const res = await fetch('/api/calendar/availability', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekCommencing,
          blocks,
          durationMin,
          pricePerSlotGbp: pricePerSlot ? Number(pricePerSlot) : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to save')
        return
      }
      setToast(
        `Saved. ${data.blocksSaved} block${data.blocksSaved === 1 ? '' : 's'} · ${data.slotsGenerated} new slot${data.slotsGenerated === 1 ? '' : 's'} generated`
      )
      setTimeout(() => setToast(''), 4000)
    } finally {
      setSaving(false)
    }
  }

  // Group blocks by day for the editor UI
  const blocksByDay: Block[][] = DAYS.map((_, day) =>
    blocks.filter((b) => b.day_of_week === day)
  )

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <p className="text-ink-muted">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-canvas px-4 py-6 md:px-8 max-w-4xl mx-auto">
      <div className="reveal reveal-1 flex items-center gap-3 mb-6">
        <Link href="/dashboard" className="text-ink-muted hover:text-brand-700 transition-colors text-sm">
          ← Dashboard
        </Link>
        <h1 className="font-display text-2xl font-bold text-ink">PT availability</h1>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm border border-red-100">{error}</div>
      )}
      {toast && (
        <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg mb-4 text-sm border border-green-100">{toast}</div>
      )}

      <div className="card shadow-card mb-6">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => setWeekCommencing((wc) => addWeeks(wc, -1))}
            className="px-3 py-1.5 text-sm bg-surface-muted text-ink hover:bg-line rounded-lg transition-colors"
          >
            ← Previous
          </button>
          <div className="text-sm font-medium text-ink">
            Week of {new Date(weekCommencing + 'T00:00:00').toLocaleDateString('en-GB', {
              weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
            })}
          </div>
          <button
            onClick={() => setWeekCommencing((wc) => addWeeks(wc, 1))}
            className="px-3 py-1.5 text-sm bg-surface-muted text-ink hover:bg-line rounded-lg transition-colors"
          >
            Next →
          </button>
          <button
            onClick={() => setWeekCommencing(mondayOfToday())}
            className="px-3 py-1.5 text-sm text-brand-700 hover:underline font-medium"
          >
            Today
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">
              Session duration (minutes)
            </label>
            <select
              value={durationMin}
              onChange={(e) => setDurationMin(parseInt(e.target.value, 10))}
              className="input-field"
            >
              <option value={30}>30 min</option>
              <option value={45}>45 min</option>
              <option value={60}>60 min</option>
              <option value={75}>75 min</option>
              <option value={90}>90 min</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">
              Price per session (£) — optional
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={pricePerSlot}
              onChange={(e) => setPricePerSlot(e.target.value)}
              placeholder="e.g. 45"
              className="input-field"
            />
          </div>
        </div>

        <div className="space-y-3">
          {DAYS.map((dayLabel, day) => (
            <div key={day} className="border border-line rounded-lg p-3">
              <div className="flex justify-between items-center mb-2">
                <div className="font-medium text-sm text-ink">{dayLabel}</div>
                <button
                  onClick={() => addBlock(day)}
                  className="text-xs text-brand-700 hover:underline font-medium"
                >
                  + Add block
                </button>
              </div>
              {blocksByDay[day].length === 0 ? (
                <div className="text-xs text-ink-muted italic">No availability</div>
              ) : (
                <div className="space-y-2">
                  {blocksByDay[day].map((b, _i) => {
                    const idx = blocks.indexOf(b)
                    return (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        <input
                          type="time"
                          value={b.start_time}
                          onChange={(e) => updateBlock(idx, { start_time: e.target.value })}
                          className="px-2 py-1 border border-line rounded-lg bg-surface text-ink focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-600/30"
                        />
                        <span className="text-ink-muted">to</span>
                        <input
                          type="time"
                          value={b.end_time}
                          onChange={(e) => updateBlock(idx, { end_time: e.target.value })}
                          className="px-2 py-1 border border-line rounded-lg bg-surface text-ink focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-600/30"
                        />
                        <button
                          onClick={() => removeBlock(idx)}
                          className="text-ink-muted hover:text-red-600 px-1 transition-colors"
                          title="Remove"
                        >
                          ×
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-between items-center gap-4">
          <p className="text-xs text-ink-muted">
            Saving regenerates bookable slots for this week. Existing booked slots are preserved.
          </p>
          <button
            onClick={save}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? 'Saving…' : 'Save availability'}
          </button>
        </div>
      </div>

      <div className="text-xs text-ink-muted px-2">
        <p>
          Clients book sessions by messaging your WhatsApp bot — they say something like
          &quot;book a session&quot; or &quot;PT availability&quot; and the bot offers them the
          slots you&apos;ve declared here.
        </p>
      </div>
    </div>
  )
}
