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
  status: string
  created_at: string
  promotion_title: string | null
  programme_name: string
}

const STATUS_COLOURS: Record<string, string> = {
  referral_pending: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-blue-100 text-blue-700',
  attended: 'bg-purple-100 text-purple-700',
  converted: 'bg-green-100 text-green-700',
  lapsed: 'bg-gray-100 text-gray-600',
}

export default function ReferralsPage() {
  const router = useRouter()
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const res = await fetch('/api/referrals', { credentials: 'include' })
    if (res.status === 401) { router.push('/auth/login'); return }
    const data = await res.json()
    setReferrals(data.referrals || [])
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/referrals/${id}/status`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    load()
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-600">Loading...</p></div>

  return (
    <div className="min-h-screen px-4 py-6 md:px-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/control-centre" className="text-gray-500 hover:text-gray-700 text-sm">← Control Centre</Link>
        <h1 className="text-2xl font-bold text-gray-900">Referrals</h1>
      </div>

      <p className="text-gray-600 mb-6 text-sm">
        Referrals are generated from &quot;Refer a friend&quot; promotions. The public
        landing page at <code className="bg-gray-100 px-1 rounded text-xs">/refer/[slug]</code>
        collects submissions.
      </p>

      <div className="space-y-3">
        {referrals.map((r) => (
          <div key={r.id} className="bg-white rounded-xl shadow-sm p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="font-semibold text-gray-900">
                  {r.friend_first_name}
                  {r.child_name && <span className="text-gray-500 font-normal"> · child: {r.child_name}</span>}
                </h3>
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
              {r.referred_by_name && <p className="text-xs text-gray-500">Referred by: {r.referred_by_name}</p>}
            </div>
            <div className="mt-3 flex gap-2">
              {r.status === 'referral_pending' && (
                <button onClick={() => updateStatus(r.id, 'confirmed')} className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700">
                  Confirm
                </button>
              )}
              {(r.status === 'referral_pending' || r.status === 'confirmed') && (
                <button onClick={() => updateStatus(r.id, 'attended')} className="text-xs bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700">
                  Mark attended
                </button>
              )}
              {r.status === 'attended' && (
                <button onClick={() => updateStatus(r.id, 'converted')} className="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700">
                  Mark converted
                </button>
              )}
              {r.status !== 'lapsed' && r.status !== 'converted' && (
                <button onClick={() => updateStatus(r.id, 'lapsed')} className="text-xs bg-gray-400 text-white px-3 py-1 rounded hover:bg-gray-500">
                  Mark lapsed
                </button>
              )}
            </div>
          </div>
        ))}
        {referrals.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm p-6 text-center text-gray-500">
            <p>No referrals yet. Create a &quot;Refer a friend&quot; promotion to get started.</p>
          </div>
        )}
      </div>
    </div>
  )
}
