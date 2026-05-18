'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Referral {
  id: string
  friend_first_name: string
  child_name: string | null
  friend_phone: string
  friend_email: string | null
  referred_by_name: string | null
  referrer_resolved: boolean
  referrer_parent_name: string | null
  referrer_credits_balance: number | null
  referrer_reward_status: 'pending' | 'notified' | 'honoured'
  referee_reward_status: 'pending' | 'applied' | 'expired'
  status: string
  first_session_at: string | null
  attended_at: string | null
  created_at: string
  promotion_title: string | null
  programme_name: string
}

interface CampaignSummary {
  promotion_id: string
  title: string | null
  status: string
  created_at: string
  programme_name: string | null
  leads_total: number
  attended: number
  converted: number
  credits_issued: number
}

// Pipeline column order — drives the grouped view below the campaigns.
const PIPELINE: Array<{ status: string; label: string }> = [
  { status: 'referral_pending', label: 'Pending' },
  { status: 'confirmed', label: 'Confirmed' },
  { status: 'attended', label: 'Attended' },
  { status: 'converted', label: 'Converted' },
  { status: 'lapsed', label: 'Lapsed' },
]

const STATUS_COLOURS: Record<string, string> = {
  referral_pending: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-blue-100 text-blue-700',
  attended: 'bg-purple-100 text-purple-700',
  converted: 'bg-green-100 text-green-700',
  lapsed: 'bg-gray-100 text-gray-600',
}

// "Today's actions" criteria per spec §5.2: any lead whose taster date is
// today or yesterday and that hasn't been resolved yet (not attended,
// converted, or lapsed). The coach should be able to mark it in 2 taps.
function isTodayAction(r: Referral): boolean {
  if (!r.first_session_at) return false
  if (r.status === 'attended' || r.status === 'converted' || r.status === 'lapsed') return false
  const session = new Date(r.first_session_at)
  if (Number.isNaN(session.getTime())) return false
  const now = Date.now()
  const oneDayMs = 24 * 60 * 60 * 1000
  return session.getTime() < now + oneDayMs && session.getTime() > now - 2 * oneDayMs
}

export default function ReferralsPage() {
  const router = useRouter()
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<string>('')

  const load = useCallback(async () => {
    const res = await fetch('/api/referrals', { credentials: 'include' })
    if (res.status === 401) { router.push('/auth/login'); return }
    const data = await res.json()
    setReferrals(data.referrals || [])
    setCampaigns(data.campaigns || [])
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  async function updateStatus(id: string, status: string) {
    setBusyId(id)
    try {
      await fetch(`/api/referrals/${id}/status`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      await load()
    } finally {
      setBusyId(null)
    }
  }

  async function issueCredit(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/referrals/${id}/issue-credit`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) {
        setToast(data.error || 'Failed to issue credit')
      } else if (data.issued) {
        setToast(`Credit issued. Balance: ${data.balance}.`)
      } else if (data.reason === 'already_honoured') {
        setToast('Credit was already issued for this referral.')
      } else {
        setToast(data.reason || 'Could not issue credit.')
      }
      await load()
    } finally {
      setBusyId(null)
      setTimeout(() => setToast(''), 4000)
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-600">Loading...</p></div>

  const todays = referrals.filter(isTodayAction)

  return (
    <div className="min-h-screen px-4 py-6 md:px-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/control-centre" className="text-gray-500 hover:text-gray-700 text-sm">← Control Centre</Link>
        <h1 className="text-2xl font-bold text-gray-900">Referrals</h1>
      </div>

      {toast && (
        <div className="bg-blue-50 text-blue-700 px-4 py-3 rounded-lg mb-4 text-sm">{toast}</div>
      )}

      {todays.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <h2 className="font-semibold text-amber-900 text-sm mb-2">Today&apos;s actions ({todays.length})</h2>
          <p className="text-xs text-amber-700 mb-3">
            Tap to confirm attendance — needed to release the referrer&apos;s free-class credit.
          </p>
          <div className="space-y-2">
            {todays.map((r) => (
              <div key={r.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
                <div className="text-sm">
                  <span className="font-medium text-gray-900">{r.child_name || r.friend_first_name}</span>
                  <span className="text-gray-500">  taster {r.first_session_at ? new Date(r.first_session_at).toLocaleDateString('en-GB') : ''}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => updateStatus(r.id, 'attended')}
                    disabled={busyId === r.id}
                    className="text-xs bg-green-600 text-white px-3 py-1.5 rounded font-medium hover:bg-green-700 disabled:opacity-50"
                  >
                    Attended
                  </button>
                  <button
                    onClick={() => updateStatus(r.id, 'lapsed')}
                    disabled={busyId === r.id}
                    className="text-xs bg-gray-300 text-gray-700 px-3 py-1.5 rounded font-medium hover:bg-gray-400 disabled:opacity-50"
                  >
                    Did not attend
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-gray-600 mb-6 text-sm">
        Referrals are generated from &quot;Refer a friend&quot; promotions. The public
        landing page at <code className="bg-gray-100 px-1 rounded text-xs">/refer/[slug]</code>
        collects submissions.
      </p>

      {campaigns.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-5 mb-6">
          <h2 className="font-semibold text-gray-900 mb-3 text-sm">Active campaigns</h2>
          <div className="space-y-3">
            {campaigns.map((c) => {
              const conversionRate = c.attended > 0
                ? Math.round((c.converted / c.attended) * 100)
                : 0
              return (
                <div key={c.promotion_id} className="border border-gray-100 rounded-lg p-3">
                  <div className="flex justify-between items-start gap-3 mb-2">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 text-sm truncate">
                        {c.title || 'Untitled campaign'}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {c.programme_name || '—'} · launched {new Date(c.created_at).toLocaleDateString('en-GB')}
                      </div>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded shrink-0 ${
                      c.status === 'sent' ? 'bg-green-100 text-green-700' :
                      c.status === 'draft' ? 'bg-gray-100 text-gray-600' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {c.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1 text-center mt-2">
                    <div>
                      <div className="text-base font-semibold text-gray-900">{c.leads_total}</div>
                      <div className="text-[10px] text-gray-500 uppercase tracking-wide">Leads</div>
                    </div>
                    <div>
                      <div className="text-base font-semibold text-gray-900">{c.attended}</div>
                      <div className="text-[10px] text-gray-500 uppercase tracking-wide">Attended</div>
                    </div>
                    <div>
                      <div className="text-base font-semibold text-gray-900">{c.converted}</div>
                      <div className="text-[10px] text-gray-500 uppercase tracking-wide">Converted</div>
                    </div>
                    <div>
                      <div className="text-base font-semibold text-gray-900">{conversionRate}%</div>
                      <div className="text-[10px] text-gray-500 uppercase tracking-wide">Conv rate</div>
                    </div>
                    <div>
                      <div className="text-base font-semibold text-gray-900">{c.credits_issued}</div>
                      <div className="text-[10px] text-gray-500 uppercase tracking-wide">Credits</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="space-y-6">
        {PIPELINE.map(({ status, label }) => {
          const bucket = referrals.filter((r) => r.status === status)
          if (bucket.length === 0) return null
          return (
            <div key={status}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                {label} ({bucket.length})
              </h3>
              <div className="space-y-3">
                {bucket.map((r) => {
                  const showIssueCredit = r.status === 'attended' && r.referrer_reward_status === 'notified' && r.referrer_resolved
                  const referrerLabel = r.referrer_parent_name || r.referred_by_name
                  return (
                    <div key={r.id} className="bg-white rounded-xl shadow-sm p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="font-semibold text-gray-900">
                            {r.friend_first_name}
                            {r.child_name && <span className="text-gray-500 font-normal"> · child: {r.child_name}</span>}
                          </h4>
                          <p className="text-xs text-gray-500 mt-1">
                            {r.programme_name}{r.promotion_title ? ` · ${r.promotion_title}` : ''}
                          </p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded ${STATUS_COLOURS[r.status] || 'bg-gray-100'}`}>
                          {r.status.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="text-sm text-gray-700 space-y-1">
                        <p>📞 {r.friend_phone}</p>
                        {r.friend_email && <p>✉️ {r.friend_email}</p>}
                        {referrerLabel && (
                          <p className="text-xs text-gray-500">
                            Referred by: {referrerLabel}
                            {!r.referrer_resolved && <span className="ml-1 text-amber-600">(unresolved)</span>}
                            {r.referrer_resolved && r.referrer_credits_balance != null && (
                              <span className="ml-1 text-gray-400">· {r.referrer_credits_balance} credit{r.referrer_credits_balance === 1 ? '' : 's'} on file</span>
                            )}
                          </p>
                        )}
                      </div>
                      <div className="mt-3 flex gap-2 flex-wrap">
                        {r.status === 'referral_pending' && (
                          <button
                            onClick={() => updateStatus(r.id, 'confirmed')}
                            disabled={busyId === r.id}
                            className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
                          >
                            Confirm
                          </button>
                        )}
                        {(r.status === 'referral_pending' || r.status === 'confirmed') && (
                          <button
                            onClick={() => updateStatus(r.id, 'attended')}
                            disabled={busyId === r.id}
                            className="text-xs bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700 disabled:opacity-50"
                          >
                            Mark attended
                          </button>
                        )}
                        {showIssueCredit && (
                          <button
                            onClick={() => issueCredit(r.id)}
                            disabled={busyId === r.id}
                            className="text-xs bg-amber-500 text-white px-3 py-1 rounded hover:bg-amber-600 disabled:opacity-50 font-medium"
                          >
                            Issue credit to {r.referrer_parent_name?.split(/\s+/)[0] || 'referrer'}
                          </button>
                        )}
                        {r.referrer_reward_status === 'honoured' && (
                          <span className="text-xs text-green-700 px-2 py-1">✓ Credit issued</span>
                        )}
                        {r.status === 'attended' && (
                          <button
                            onClick={() => updateStatus(r.id, 'converted')}
                            disabled={busyId === r.id}
                            className="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 disabled:opacity-50"
                          >
                            Mark converted
                          </button>
                        )}
                        {r.status !== 'lapsed' && r.status !== 'converted' && (
                          <button
                            onClick={() => updateStatus(r.id, 'lapsed')}
                            disabled={busyId === r.id}
                            className="text-xs bg-gray-400 text-white px-3 py-1 rounded hover:bg-gray-500 disabled:opacity-50"
                          >
                            Mark lapsed
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
        {referrals.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm p-6 text-center text-gray-500">
            <p>No referrals yet. Create a &quot;Refer a friend&quot; promotion to get started.</p>
          </div>
        )}
      </div>
    </div>
  )
}
