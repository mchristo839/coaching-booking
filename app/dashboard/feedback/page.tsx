'use client'

// app/dashboard/feedback/page.tsx
// Fitness-only manager view: send a post-session feedback request and read
// recent responses. Hidden from sport coaches via the sidebar (the page
// itself remains reachable by URL, but it'll just be empty for them).

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Programme {
  id: string
  programmeName: string
}

interface FeedbackResponse {
  id: string
  programme_id: string
  programme_name: string
  client_name: string | null
  pt_name: string | null
  score: number | null
  written_feedback: string | null
  flagged_for_manager: boolean
  session_date: string | null
  created_at: string
  responded_at: string | null
}

interface PendingRequest {
  id: string
  programme_id: string
  programme_name: string
  client_name: string | null
  pt_name: string | null
  state: string
  created_at: string
  expires_at: string
}

const SCORE_COLORS: Record<number, string> = {
  1: 'bg-red-100 text-red-700',
  2: 'bg-red-100 text-red-700',
  3: 'bg-amber-100 text-amber-700',
  4: 'bg-green-100 text-green-700',
  5: 'bg-green-100 text-green-700',
}

export default function FeedbackPage() {
  const router = useRouter()
  const [programmes, setProgrammes] = useState<Programme[]>([])
  const [responses, setResponses] = useState<FeedbackResponse[]>([])
  const [pending, setPending] = useState<PendingRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const [programmeId, setProgrammeId] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [ptName, setPtName] = useState('')
  const [sessionDate, setSessionDate] = useState('')
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    try {
      const [progRes, fbRes] = await Promise.all([
        fetch('/api/programmes/list', { credentials: 'include' }),
        fetch('/api/feedback/list', { credentials: 'include' }),
      ])
      if (progRes.status === 401) {
        router.push('/auth/login')
        return
      }
      if (progRes.ok) {
        const d = await progRes.json()
        const list: Programme[] = (d.programmes || []).map((p: { id: string; programName: string; programmeName?: string }) => ({
          id: p.id,
          programmeName: p.programmeName || p.programName || '(unnamed)',
        }))
        setProgrammes(list)
        if (list.length > 0 && !programmeId) setProgrammeId(list[0].id)
      }
      if (fbRes.ok) {
        const d = await fbRes.json()
        setResponses(d.responses || [])
        setPending(d.pending || [])
      }
    } catch {
      setError('Failed to load')
    } finally {
      setLoading(false)
    }
  // programmeId intentionally excluded — we only seed it on first load
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  useEffect(() => {
    const id = localStorage.getItem('coachId')
    if (!id) { router.push('/auth/login'); return }
    load()
  }, [router, load])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    if (!programmeId || !clientName.trim() || !clientPhone.trim()) {
      setError('Programme, client name and phone are required')
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/feedback/send', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programmeId,
          clientName: clientName.trim(),
          clientPhone: clientPhone.trim(),
          ptName: ptName.trim() || undefined,
          sessionDate: sessionDate || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to send')
        return
      }
      setSuccessMsg(`Feedback request sent to ${clientName}.`)
      setClientName('')
      setClientPhone('')
      setPtName('')
      setSessionDate('')
      load()
    } catch {
      setError('Failed to send')
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <p className="text-ink-muted">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-canvas px-4 py-6 md:px-8 max-w-4xl mx-auto">
      <Link href="/dashboard" className="text-brand-700 hover:underline text-sm mb-4 inline-block">
        &larr; Back to Dashboard
      </Link>

      <h1 className="reveal reveal-1 font-display text-2xl font-bold text-ink mb-1">Post-session feedback</h1>
      <p className="text-sm text-ink-muted mb-6">
        Send a 1–5 rating prompt to a client after their session. They reply on WhatsApp
        with a number; we log the score and trigger a referral pitch on a 4 or 5.
      </p>

      {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm border border-red-100">{error}</div>}
      {successMsg && <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg mb-4 text-sm border border-green-100">{successMsg}</div>}

      {/* Send form */}
      <div className="card shadow-card mb-6">
        <h2 className="font-display text-lg font-semibold text-ink mb-4">Send a feedback request</h2>
        <form onSubmit={handleSend} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Class / Programme *</label>
            <select
              value={programmeId}
              onChange={(e) => setProgrammeId(e.target.value)}
              className="input-field"
            >
              {programmes.map((p) => (
                <option key={p.id} value={p.id}>{p.programmeName}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Client name *</label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Sarah Brown"
                required
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Client mobile *</label>
              <input
                type="tel"
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                placeholder="07123 456789"
                required
                className="input-field"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Trainer (optional)</label>
              <input
                type="text"
                value={ptName}
                onChange={(e) => setPtName(e.target.value)}
                placeholder="e.g. Mike"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Session date (optional)</label>
              <input
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                className="input-field"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={sending}
            className="btn-primary"
          >
            {sending ? 'Sending...' : 'Send feedback request'}
          </button>
        </form>
      </div>

      {/* Outstanding pending requests */}
      {pending.length > 0 && (
        <div className="card shadow-card mb-6">
          <h2 className="font-display text-lg font-semibold text-ink mb-3">Awaiting reply ({pending.length})</h2>
          <ul className="space-y-2">
            {pending.map((p) => (
              <li key={p.id} className="flex justify-between items-center text-sm border-b border-line pb-2 last:border-0 last:pb-0">
                <div>
                  <span className="font-medium text-ink">{p.client_name || '(unnamed)'}</span>
                  <span className="text-ink-muted"> — {p.programme_name}</span>
                </div>
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded">{p.state.replace(/_/g, ' ')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent responses */}
      <div className="card shadow-card">
        <h2 className="font-display text-lg font-semibold text-ink mb-3">Recent responses</h2>
        {responses.length === 0 ? (
          <p className="text-sm text-ink-muted">No feedback yet — send your first request above.</p>
        ) : (
          <ul className="space-y-3">
            {responses.map((r) => (
              <li key={r.id} className={`border rounded-lg p-3 ${r.flagged_for_manager ? 'border-red-200 bg-red-50' : 'border-line'}`}>
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-ink">{r.client_name || '(unnamed)'}</span>
                      <span className="text-xs text-ink-muted">— {r.programme_name}</span>
                      {r.pt_name && <span className="text-xs text-ink-muted">w/ {r.pt_name}</span>}
                    </div>
                    {r.written_feedback && (
                      <p className="text-sm text-ink-muted whitespace-pre-wrap mt-1">&ldquo;{r.written_feedback}&rdquo;</p>
                    )}
                    <p className="text-xs text-ink-muted mt-1">
                      {new Date(r.created_at).toLocaleString('en-GB')}
                      {r.flagged_for_manager && <span className="ml-2 text-red-600 font-medium">⚑ flagged</span>}
                    </p>
                  </div>
                  {r.score != null && (
                    <span className={`text-sm font-semibold px-3 py-1 rounded-full ${SCORE_COLORS[r.score]}`}>
                      {r.score}/5
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
