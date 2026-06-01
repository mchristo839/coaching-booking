'use client'

// Read-only list of PT sessions for the logged-in coach.
// Phase 1 — viewing only. Action buttons (mark attended, mark paid, cancel) come
// in Phase 3 alongside Flow 6 (Cancellation) and Flow 5 polish.

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Session {
  id: string
  session_date: string
  start_time: string
  end_time: string
  duration_min: number
  price_gbp: string | null
  status: 'booked' | 'completed' | 'cancelled' | 'no_show'
  payment_status: 'pending' | 'self_reported' | 'confirmed' | 'refunded' | null
  feedback_score: number | null
  member_name: string | null
  member_phone: string | null
}

const STATUS_COLOURS: Record<string, string> = {
  booked: 'bg-brand-50 text-brand-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-surface-muted text-ink-muted',
  no_show: 'bg-red-100 text-red-700',
}
const PAYMENT_COLOURS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  self_reported: 'bg-brand-50 text-brand-700',
  confirmed: 'bg-green-100 text-green-700',
  refunded: 'bg-surface-muted text-ink-muted',
}

function formatTime(t: string): string {
  const [hStr, mStr] = t.split(':')
  let h = parseInt(hStr, 10)
  const m = (mStr || '00').padStart(2, '0')
  const ampm = h >= 12 ? 'pm' : 'am'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return m === '00' ? `${h}${ampm}` : `${h}:${m}${ampm}`
}

export default function SessionsPage() {
  const router = useRouter()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const res = await fetch('/api/calendar/sessions', { credentials: 'include' })
    if (res.status === 401) { router.push('/auth/login'); return }
    const data = await res.json()
    setSessions(data.sessions || [])
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-canvas"><p className="text-ink-muted">Loading…</p></div>
  }

  // Split into upcoming vs past
  const now = Date.now()
  const upcoming = sessions.filter((s) => new Date(s.session_date + 'T00:00:00').getTime() >= now - 24 * 3600 * 1000)
  const past = sessions.filter((s) => new Date(s.session_date + 'T00:00:00').getTime() < now - 24 * 3600 * 1000)

  return (
    <div className="min-h-screen bg-canvas px-4 py-6 md:px-8 max-w-4xl mx-auto">
      <div className="reveal reveal-1 flex items-center gap-3 mb-6">
        <Link href="/dashboard" className="text-ink-muted hover:text-brand-700 transition-colors text-sm">
          ← Dashboard
        </Link>
        <h1 className="font-display text-2xl font-bold text-ink">Sessions</h1>
      </div>

      {sessions.length === 0 ? (
        <div className="card shadow-card text-center text-ink-muted">
          <p>No PT sessions yet.</p>
          <p className="text-sm mt-2">
            Declare your availability in{' '}
            <Link href="/dashboard/availability" className="text-brand-700 hover:underline">
              PT availability
            </Link>{' '}
            so clients can book.
          </p>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <SessionGroup title={`Upcoming (${upcoming.length})`} sessions={upcoming} />
          )}
          {past.length > 0 && (
            <SessionGroup title={`Past (${past.length})`} sessions={past} muted />
          )}
        </>
      )}
    </div>
  )
}

function SessionGroup({ title, sessions, muted = false }: { title: string; sessions: Session[]; muted?: boolean }) {
  return (
    <div className="mb-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-2">{title}</h2>
      <div className="space-y-2">
        {sessions.map((s) => {
          const dateLabel = new Date(s.session_date + 'T00:00:00').toLocaleDateString('en-GB', {
            weekday: 'short', day: 'numeric', month: 'short',
          })
          return (
            <div key={s.id} className={`bg-surface rounded-xl border border-line shadow-card p-4 ${muted ? 'opacity-75' : ''}`}>
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="font-semibold text-ink">
                    {s.member_name || 'Unknown member'}
                    {s.member_phone && <span className="text-ink-muted font-normal ml-2 text-xs">{s.member_phone}</span>}
                  </div>
                  <div className="text-sm text-ink-muted mt-1">
                    {dateLabel} · {formatTime(s.start_time)}–{formatTime(s.end_time)} · {s.duration_min} min
                  </div>
                </div>
                <div className="flex flex-col gap-1 items-end">
                  <span className={`text-xs px-2 py-1 rounded ${STATUS_COLOURS[s.status] || 'bg-surface-muted text-ink-muted'}`}>
                    {s.status.replace('_', ' ')}
                  </span>
                  {s.payment_status && (
                    <span className={`text-xs px-2 py-1 rounded ${PAYMENT_COLOURS[s.payment_status] || 'bg-surface-muted text-ink-muted'}`}>
                      pay: {s.payment_status.replace('_', ' ')}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex justify-between items-center text-xs text-ink-muted">
                <div>{s.price_gbp ? `£${Number(s.price_gbp).toFixed(2)}` : '—'}</div>
                {s.feedback_score != null && (
                  <div>Feedback: {'⭐'.repeat(s.feedback_score)}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
