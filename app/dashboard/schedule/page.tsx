'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface AuthorisedProgramme {
  programme_id: string
  programme_name: string
}

interface ScheduleInstance {
  series_id: string
  programme_id: string
  date: string
  starts_at: string
  duration_mins: number
  title: string | null
  venue: string | null
  status: 'scheduled' | 'cancelled' | 'rescheduled'
  rescheduled_to: string | null
  reason: string | null
}

interface Series {
  id: string
  title: string | null
  series_type: string
  recurrence_rule: string
  default_time: string
  default_venue: string | null
}

export default function SchedulePage() {
  const router = useRouter()
  const [programmes, setProgrammes] = useState<AuthorisedProgramme[]>([])
  const [selectedProgrammeId, setSelectedProgrammeId] = useState('')
  const [instances, setInstances] = useState<ScheduleInstance[]>([])
  const [series, setSeries] = useState<Series[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Create series form
  const [showCreate, setShowCreate] = useState(false)
  const [seriesTitle, setSeriesTitle] = useState('')
  const [seriesRrule, setSeriesRrule] = useState('FREQ=WEEKLY;BYDAY=SA')
  const [seriesStart, setSeriesStart] = useState('')
  const [seriesTime, setSeriesTime] = useState('10:00')
  const [seriesDuration, setSeriesDuration] = useState('60')
  const [seriesVenue, setSeriesVenue] = useState('')

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/auth/authorised-programmes', { credentials: 'include' })
      if (res.status === 401) { router.push('/auth/login'); return }
      const data = await res.json()
      setProgrammes(data.programmes || [])
      if (data.programmes?.[0]) setSelectedProgrammeId(data.programmes[0].programme_id)
      setLoading(false)
    }
    load()
  }, [router])

  const loadSchedule = useCallback(async () => {
    if (!selectedProgrammeId) return
    const [upc, srs] = await Promise.all([
      fetch(`/api/schedule/upcoming?programme_id=${selectedProgrammeId}&weeks=8`, { credentials: 'include' }),
      fetch(`/api/schedule/series?programme_id=${selectedProgrammeId}`, { credentials: 'include' }),
    ])
    if (upc.ok) {
      const data = await upc.json()
      setInstances(data.instances || [])
    }
    if (srs.ok) {
      const data = await srs.json()
      setSeries(data.series || [])
    }
  }, [selectedProgrammeId])

  useEffect(() => {
    loadSchedule()
  }, [loadSchedule])

  async function handleCreateSeries(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError('')

    try {
      const res = await fetch('/api/schedule/series', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programmeId: selectedProgrammeId,
          seriesType: 'training',
          title: seriesTitle.trim() || null,
          recurrenceRule: seriesRrule,
          seriesStart,
          defaultTime: seriesTime,
          defaultDurationMins: parseInt(seriesDuration),
          defaultVenue: seriesVenue.trim() || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed')
        return
      }
      setSuccess('Series created')
      setShowCreate(false)
      loadSchedule()
    } finally {
      setCreating(false)
    }
  }

  async function cancelInstance(instance: ScheduleInstance) {
    const reason = window.prompt('Reason for cancellation? (optional)')
    if (reason === null) return

    const res = await fetch('/api/schedule/exceptions', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seriesId: instance.series_id,
        originalDate: instance.date,
        status: 'cancelled',
        reason: reason || null,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Failed to cancel')
      return
    }
    if (data.cascade?.blocked) {
      setError(`Internal notifications failed — external blocked. Errors: ${data.cascade.errors.join(', ')}`)
    } else {
      setSuccess(
        `Cancelled. Internal sent: ${data.cascade?.internalSent || 0}, External sent: ${data.cascade?.externalSent ? 'yes' : 'no'}`
      )
    }
    loadSchedule()
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-600">Loading...</p></div>

  return (
    <div className="min-h-screen px-4 py-6 md:px-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/control-centre" className="text-gray-500 hover:text-gray-700 text-sm">← Control Centre</Link>
        <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
      </div>

      {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}
      {success && <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg mb-4 text-sm">{success}</div>}

      <div className="bg-white rounded-xl shadow-sm p-5 mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Programme</label>
        <select
          value={selectedProgrammeId}
          onChange={(e) => setSelectedProgrammeId(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900"
        >
          {programmes.map((p) => (
            <option key={p.programme_id} value={p.programme_id}>{p.programme_name}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-5 mb-4">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold text-gray-900">Recurring series ({series.length})</h2>
          <button onClick={() => setShowCreate(!showCreate)} className="text-blue-600 text-sm hover:underline">
            {showCreate ? 'Cancel' : '+ New series'}
          </button>
        </div>

        {showCreate && (
          <form onSubmit={handleCreateSeries} className="bg-gray-50 p-4 rounded-lg space-y-3 mb-4">
            <input
              type="text"
              value={seriesTitle}
              onChange={(e) => setSeriesTitle(e.target.value)}
              placeholder="Series title (optional)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={seriesStart}
                onChange={(e) => setSeriesStart(e.target.value)}
                required
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
              <input
                type="time"
                value={seriesTime}
                onChange={(e) => setSeriesTime(e.target.value)}
                required
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>
            <input
              type="text"
              value={seriesRrule}
              onChange={(e) => setSeriesRrule(e.target.value)}
              placeholder="RRULE (e.g. FREQ=WEEKLY;BYDAY=SA)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 font-mono"
            />
            <input
              type="text"
              value={seriesVenue}
              onChange={(e) => setSeriesVenue(e.target.value)}
              placeholder="Default venue"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            />
            <input
              type="number"
              min="10"
              max="240"
              value={seriesDuration}
              onChange={(e) => setSeriesDuration(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              placeholder="Duration (mins)"
            />
            <button
              type="submit"
              disabled={creating}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create series'}
            </button>
          </form>
        )}

        <ul className="space-y-1 text-sm">
          {series.map((s) => (
            <li key={s.id} className="flex justify-between text-gray-700">
              <span>{s.title || s.series_type}</span>
              <code className="text-xs bg-gray-100 px-2 py-0.5 rounded">{s.recurrence_rule}</code>
            </li>
          ))}
          {series.length === 0 && <li className="text-gray-400 italic">No series yet.</li>}
        </ul>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Upcoming (next 8 weeks)</h2>
        <ul className="space-y-2">
          {instances.map((inst) => (
            <li
              key={`${inst.series_id}-${inst.date}`}
              className={`flex justify-between items-center text-sm p-3 rounded-lg ${
                inst.status === 'cancelled' ? 'bg-red-50' :
                inst.status === 'rescheduled' ? 'bg-yellow-50' :
                'bg-gray-50'
              }`}
            >
              <div>
                <div className="font-medium text-gray-900">
                  {new Date(inst.starts_at).toLocaleString('en-GB', {
                    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </div>
                <div className="text-xs text-gray-500">
                  {inst.title || 'Session'}{inst.venue ? ` · ${inst.venue}` : ''}
                  {inst.status === 'cancelled' && ` · CANCELLED${inst.reason ? ` (${inst.reason})` : ''}`}
                  {inst.status === 'rescheduled' && ` · Moved to ${inst.rescheduled_to ? new Date(inst.rescheduled_to).toLocaleString('en-GB') : 'TBC'}`}
                </div>
              </div>
              {inst.status === 'scheduled' && (
                <button
                  onClick={() => cancelInstance(inst)}
                  className="text-red-600 text-xs hover:underline"
                >
                  Cancel
                </button>
              )}
            </li>
          ))}
          {instances.length === 0 && <li className="text-gray-400 italic">No upcoming sessions. Create a series above.</li>}
        </ul>
      </div>
    </div>
  )
}
