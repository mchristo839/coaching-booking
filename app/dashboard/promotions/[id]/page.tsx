'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

interface Promotion {
  id: string
  promotion_type: string
  title: string | null
  detail: string
  generated_message: string | null
  status: string
  slug: string | null
  send_mode: string
  created_at: string
  sent_at: string | null
}

interface Target {
  id: string
  programme_id: string
  programme_name: string
  whatsapp_group_id: string | null
  send_status: string
  error: string | null
}

export default function PromotionDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [promotion, setPromotion] = useState<Promotion | null>(null)
  const [targets, setTargets] = useState<Target[]>([])
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/promotions/${id}/detail`, { credentials: 'include' })
      if (res.status === 401) {
        router.push('/auth/login')
        return
      }
      if (!res.ok) {
        setError('Failed to load promotion')
        return
      }
      const data = await res.json()
      setPromotion(data.promotion)
      setTargets(data.targets || [])
    } catch {
      setError('Failed to load promotion')
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => {
    load()
  }, [load])

  async function handleRegenerate() {
    setRegenerating(true)
    setError('')
    try {
      const res = await fetch(`/api/promotions/${id}/regenerate`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to regenerate')
        return
      }
      setPromotion((prev) => (prev ? { ...prev, generated_message: data.message } : prev))
    } finally {
      setRegenerating(false)
    }
  }

  async function handleSend() {
    if (!confirm('Send this message to all target groups now?')) return
    setSending(true)
    setError('')
    try {
      const res = await fetch(`/api/promotions/${id}/send`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to send')
        return
      }
      setSuccess(`Sent to ${data.sent} group(s). ${data.failed} failed.`)
      load()
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  if (!promotion) {
    return (
      <div className="min-h-screen px-4 py-6 md:px-8 max-w-3xl mx-auto">
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg">Promotion not found</div>
      </div>
    )
  }

  const isDraft = promotion.status === 'draft'

  return (
    <div className="min-h-screen px-4 py-6 md:px-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/dashboard/control-centre"
          className="text-gray-500 hover:text-gray-700 text-sm"
        >
          ← Control Centre
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Promotion preview</h1>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>
      )}
      {success && (
        <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg mb-4 text-sm">{success}</div>
      )}

      <div className="bg-white rounded-xl shadow-sm p-5 mb-6">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h2 className="font-semibold text-gray-900">
              {promotion.title || `${promotion.promotion_type.replace(/_/g, ' ')}`}
            </h2>
            <p className="text-xs text-gray-500 mt-1">Status: {promotion.status}</p>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 whitespace-pre-wrap text-sm text-gray-800 font-mono">
          {promotion.generated_message || '(no message generated)'}
        </div>

        {isDraft && (
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
            >
              {regenerating ? 'Regenerating...' : 'Regenerate'}
            </button>
            <button
              onClick={handleSend}
              disabled={sending}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {sending ? 'Sending...' : `Send to ${targets.length} group${targets.length === 1 ? '' : 's'}`}
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Target groups</h2>
        <ul className="space-y-2">
          {targets.map((t) => (
            <li key={t.id} className="flex justify-between items-center text-sm">
              <span className="text-gray-900">{t.programme_name}</span>
              <span className={`text-xs px-2 py-1 rounded ${
                t.send_status === 'sent' ? 'bg-green-100 text-green-700' :
                t.send_status === 'failed' ? 'bg-red-100 text-red-700' :
                'bg-gray-100 text-gray-600'
              }`}>
                {t.send_status}{t.error ? ` — ${t.error}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
