'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface Poll {
  id: string
  question: string
  options: string[] | string
  status: string
  anonymous: boolean
  closes_at: string | null
  created_at: string
}

interface Tally {
  chosen_option: string
  count: string
}

interface Target {
  programme_name: string
}

interface Response {
  sender_name: string
  chosen_option: string
  created_at: string
}

export default function PollDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [poll, setPoll] = useState<Poll | null>(null)
  const [tally, setTally] = useState<Tally[]>([])
  const [targets, setTargets] = useState<Target[]>([])
  const [responses, setResponses] = useState<Response[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const res = await fetch(`/api/polls/${id}/responses`, { credentials: 'include' })
    if (res.status === 401) { router.push('/auth/login'); return }
    if (!res.ok) { setError('Failed to load'); setLoading(false); return }
    const data = await res.json()
    setPoll(data.poll)
    setTally(data.tally || [])
    setTargets(data.targets || [])
    setResponses(data.responses || [])
    setLoading(false)
  }, [id, router])

  useEffect(() => {
    load()
    const interval = setInterval(load, 10000)
    return () => clearInterval(interval)
  }, [load])

  async function handleClose() {
    if (!confirm('Close this poll? No more votes will be accepted.')) return
    await fetch(`/api/polls/${id}/close`, { method: 'POST', credentials: 'include' })
    load()
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-canvas"><p className="text-ink-muted">Loading...</p></div>
  if (!poll) return <div className="min-h-screen bg-canvas px-4 py-8 max-w-3xl mx-auto"><p className="text-red-600">{error || 'Not found'}</p></div>

  const options: string[] = Array.isArray(poll.options) ? poll.options : JSON.parse(poll.options || '[]')
  const totalVotes = tally.reduce((sum, t) => sum + parseInt(t.count), 0)

  return (
    <div className="min-h-screen bg-canvas px-4 py-8 md:px-8 max-w-3xl mx-auto">
      <div className="reveal reveal-1 flex items-center gap-3 mb-6">
        <Link href="/dashboard/control-centre" className="text-ink-muted hover:text-brand-700 text-sm transition-colors">← Control Centre</Link>
        <h1 className="font-display text-2xl font-bold text-ink">Poll results</h1>
      </div>

      <div className="card shadow-card mb-6">
        <h2 className="font-display font-semibold text-ink mb-1">{poll.question}</h2>
        <p className="text-xs text-ink-muted mb-4">
          Status: {poll.status} · Total votes: {totalVotes} · Target groups: {targets.length}
          {poll.closes_at && ` · Closes: ${new Date(poll.closes_at).toLocaleString('en-GB')}`}
        </p>

        <div className="space-y-2 mb-4">
          {options.map((opt, i) => {
            const tallyRow = tally.find((t) => t.chosen_option === opt)
            const count = tallyRow ? parseInt(tallyRow.count) : 0
            const pct = totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 100)
            return (
              <div key={opt} className="flex items-center gap-3">
                <span className="text-sm text-ink-muted w-8">{String.fromCharCode(97 + i)})</span>
                <span className="text-sm text-ink flex-1">{opt}</span>
                <div className="flex-1 bg-surface-muted rounded-full h-2 overflow-hidden">
                  <div className="bg-brand-600 h-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-sm text-ink w-16 text-right">{count} ({pct}%)</span>
              </div>
            )
          })}
        </div>

        {poll.status === 'active' && (
          <button
            onClick={handleClose}
            className="btn-secondary"
          >
            Close poll
          </button>
        )}
      </div>

      {!poll.anonymous && responses.length > 0 && (
        <div className="card shadow-card">
          <h3 className="font-display font-semibold text-ink mb-3">Who voted</h3>
          <ul className="space-y-1 text-sm">
            {responses.map((r, i) => (
              <li key={i} className="flex justify-between">
                <span className="text-ink">{r.sender_name || 'Anonymous'}</span>
                <span className="text-ink-muted">{r.chosen_option}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
