'use client'

// Inbox dashboard — Paul's spec INBOX PANEL.
// Shows operational pulse: messages today, bot-resolved %, escalations,
// sentiment, response time, recent message stream.

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Stats {
  total_today: number
  bot_resolved_today: number
  escalated_today: number
  avg_response_ms_today: number | null
  sentiment_positive_pct: number
  sentiment_negative_pct: number
}
interface Entry {
  id: string
  received_at: string
  sender_jid: string
  sender_type: 'member' | 'coach' | 'unknown' | null
  message_text: string | null
  is_group: boolean
  group_jid: string | null
  intent: string | null
  intent_confidence: number | null
  sentiment: 'positive' | 'neutral' | 'negative' | null
  action_taken: string | null
  resolved_by: 'bot' | 'manager' | 'unresolved' | null
  escalated: boolean
  response_time_ms: number | null
}

const INTENT_COLOURS: Record<string, string> = {
  booking_request: 'bg-brand-50 text-brand-700',
  class_enquiry: 'bg-brand-50 text-brand-700',
  cancellation: 'bg-orange-100 text-orange-700',
  payment_query: 'bg-surface-muted text-ink-muted',
  rescheduling: 'bg-orange-100 text-orange-700',
  feedback_complaint: 'bg-red-100 text-red-700',
  referral_interest: 'bg-green-100 text-green-700',
  faq_general: 'bg-surface-muted text-ink-muted',
  membership_query: 'bg-surface-muted text-ink-muted',
  pt_availability: 'bg-amber-100 text-amber-700',
  social: 'bg-surface-muted text-ink-muted',
  unclassifiable: 'bg-surface-muted text-ink-muted',
}

export default function InboxPage() {
  const router = useRouter()
  const [stats, setStats] = useState<Stats | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const res = await fetch('/api/inbox', { credentials: 'include' })
    if (res.status === 401) { router.push('/auth/login'); return }
    const data = await res.json()
    setStats(data.stats || null)
    setEntries(data.entries || [])
    setLoading(false)
  }, [router])

  useEffect(() => {
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [load])

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-canvas"><p className="text-ink-muted">Loading…</p></div>
  }

  const resolvedPct = stats && stats.total_today > 0
    ? Math.round((stats.bot_resolved_today / stats.total_today) * 100)
    : 0
  const avgResponse = stats?.avg_response_ms_today != null
    ? `${(stats.avg_response_ms_today / 1000).toFixed(1)}s`
    : '—'

  return (
    <div className="min-h-screen bg-canvas px-4 py-6 md:px-8 max-w-4xl mx-auto">
      <div className="reveal reveal-1 flex items-center gap-3 mb-6">
        <Link href="/dashboard" className="text-ink-muted hover:text-brand-700 transition-colors text-sm">← Dashboard</Link>
        <h1 className="font-display text-2xl font-bold text-ink">Inbox</h1>
        <span className="text-xs text-ink-muted">refreshes every 30s</span>
      </div>

      {/* Stats grid */}
      <div className="reveal reveal-2 grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard label="Messages today" value={stats?.total_today ?? 0} />
        <StatCard label="Bot resolved" value={`${resolvedPct}%`} sub={`${stats?.bot_resolved_today ?? 0} of ${stats?.total_today ?? 0}`} />
        <StatCard label="Escalated" value={stats?.escalated_today ?? 0} accent={(stats?.escalated_today || 0) > 0 ? 'amber' : undefined} />
        <StatCard label="Avg response" value={avgResponse} />
        <StatCard
          label="Sentiment"
          value={`${stats?.sentiment_positive_pct ?? 0}% +`}
          sub={`${stats?.sentiment_negative_pct ?? 0}% –`}
        />
      </div>

      {/* Recent entries */}
      <div className="reveal reveal-2 bg-surface rounded-xl border border-line shadow-card">
        <div className="px-5 py-3 border-b border-line">
          <h2 className="font-display font-semibold text-ink text-sm">Recent messages</h2>
        </div>
        {entries.length === 0 ? (
          <div className="p-6 text-center text-ink-muted text-sm">No messages yet.</div>
        ) : (
          <ul className="divide-y divide-line">
            {entries.map((e) => (
              <li key={e.id} className="px-5 py-3 hover:bg-surface-muted/50 transition-colors">
                <div className="flex justify-between items-start gap-3 mb-1">
                  <div className="text-xs text-ink-muted shrink-0">
                    {new Date(e.received_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} ·{' '}
                    <span className="capitalize">{e.sender_type || 'unknown'}</span>
                  </div>
                  <div className="flex gap-1 flex-wrap justify-end">
                    {e.intent && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${INTENT_COLOURS[e.intent] || 'bg-surface-muted text-ink-muted'}`}>
                        {e.intent.replace(/_/g, ' ')}
                        {e.intent_confidence != null && <span className="opacity-60"> ·{Math.round(e.intent_confidence * 100)}%</span>}
                      </span>
                    )}
                    {e.sentiment && e.sentiment !== 'neutral' && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${e.sentiment === 'negative' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {e.sentiment}
                      </span>
                    )}
                    {e.escalated && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">escalated</span>
                    )}
                  </div>
                </div>
                <div className="text-sm text-ink truncate">{e.message_text}</div>
                {e.action_taken && (
                  <div className="text-[10px] text-ink-muted mt-1">→ {e.action_taken.replace(/_/g, ' ')}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, accent }: { label: string; value: number | string; sub?: string; accent?: 'amber' }) {
  const accentClass = accent === 'amber' ? 'border-amber-300 bg-amber-50' : 'border-line bg-surface'
  return (
    <div className={`rounded-xl shadow-card p-3 border ${accentClass}`}>
      <div className="text-[10px] uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="font-display text-2xl font-semibold text-ink mt-1">{value}</div>
      {sub && <div className="text-[10px] text-ink-muted mt-0.5">{sub}</div>}
    </div>
  )
}
